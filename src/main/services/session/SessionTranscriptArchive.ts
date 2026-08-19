import type { Dirent } from 'node:fs';
import {
  chmod,
  type FileHandle,
  mkdir,
  open as openFile,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { RUNTIME_STATE_DIRNAME } from '@shared/paths';
import type { SessionTranscriptHealth } from '@shared/types';

const SESSION_TRANSCRIPT_ARCHIVE_DIRNAME = 'session-transcripts';
const SESSION_TRANSCRIPT_FILENAME_SUFFIX = '.log';
const SESSION_TRANSCRIPT_V2_DIRECTORY_NAME = 'v2';
const SESSION_TRANSCRIPT_SEGMENTS_DIRECTORY_NAME = 'segments';
const SESSION_TRANSCRIPT_MANIFEST_FILE_NAME = 'manifest.json';
const SESSION_TRANSCRIPT_MANIFEST_VERSION = 2;
const SESSION_TRANSCRIPT_SEGMENT_FILE_SUFFIX = '.log';
const SESSION_TRANSCRIPT_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/u;
const SESSION_TRANSCRIPT_SEGMENT_FILE_PATTERN = /^(\d{20})\.log$/u;

export const MAX_SESSION_TRANSCRIPT_PAGE_BYTES = 256 * 1024;
export const DEFAULT_MAX_SESSION_TRANSCRIPT_BYTES = 32 * 1024 * 1024;
export const DEFAULT_SESSION_TRANSCRIPT_SEGMENT_BYTES = 1024 * 1024;
export const DEFAULT_SESSION_TRANSCRIPT_APPEND_DELAY_MS = 16;
export const DEFAULT_SESSION_TRANSCRIPT_PENDING_APPEND_BYTES = 512 * 1024;

export interface SessionTranscriptArchivePageRequest {
  sessionId: string;
  beforeByteOffset?: number;
  maxBytes: number;
}

export interface SessionTranscriptArchivePage {
  text: string;
  startByteOffset: number;
  endByteOffset: number;
  hasMore: boolean;
  totalBytes: number;
  health: SessionTranscriptHealth;
}

export interface SessionTranscriptArchiveDiagnostics {
  retainedBytes: number;
  segmentCount: number;
  pendingAppendBytes: number;
}

export interface SessionTranscriptArchiveOptions {
  rootDirectory?: string;
  maxBytes?: number;
  segmentBytes?: number;
  appendDelayMs?: number;
  maxPendingAppendBytes?: number;
}

interface TranscriptSegment {
  id: number;
  byteLength: number;
}

interface TranscriptState {
  segments: TranscriptSegment[];
  retainedBytes: number;
  dirty: boolean;
}

interface TranscriptManifest {
  version: number;
  retainedBytes: number;
  segments: TranscriptSegment[];
}

interface PendingTranscriptAppend {
  buffers: Buffer[];
  byteLength: number;
  latestSequence: number;
  completedSequence: number;
  inFlightByteLength: number;
  inFlight?: Promise<void>;
  timer?: ReturnType<typeof setTimeout>;
}

function isUtf8ContinuationByte(value: number | undefined): boolean {
  return value !== undefined && value >= 0x80 && value <= 0xbf;
}

function getUtf8SequenceLength(value: number | undefined): number {
  if (value === undefined || value <= 0x7f) {
    return 1;
  }
  if (value >= 0xc2 && value <= 0xdf) {
    return 2;
  }
  if (value >= 0xe0 && value <= 0xef) {
    return 3;
  }
  if (value >= 0xf0 && value <= 0xf4) {
    return 4;
  }
  return 1;
}

function findSafeUtf8Start(buffer: Buffer): number {
  let start = 0;
  while (start < buffer.length && isUtf8ContinuationByte(buffer[start])) {
    start += 1;
  }
  return start;
}

function findSafeUtf8End(buffer: Buffer, start: number): number {
  let cursor = start;
  while (cursor < buffer.length) {
    const sequenceLength = getUtf8SequenceLength(buffer[cursor]);
    if (cursor + sequenceLength > buffer.length) {
      return cursor;
    }

    let validContinuation = true;
    for (let offset = 1; offset < sequenceLength; offset += 1) {
      if (!isUtf8ContinuationByte(buffer[cursor + offset])) {
        validContinuation = false;
        break;
      }
    }

    cursor += validContinuation ? sequenceLength : 1;
  }
  return cursor;
}

function normalizePageSize(maxBytes: number): number {
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0 ||
    maxBytes > MAX_SESSION_TRANSCRIPT_PAGE_BYTES
  ) {
    throw new RangeError(`Invalid session transcript page size: ${maxBytes}`);
  }
  return maxBytes;
}

function normalizeBeforeByteOffset(value: number | undefined, size: number): number {
  if (value === undefined) {
    return size;
  }
  if (!Number.isSafeInteger(value) || value < 0 || value > size) {
    throw new RangeError(`Invalid session transcript cursor: ${value}`);
  }
  return value;
}

function normalizeArchiveCapacity(maxBytes: number | undefined): number {
  const resolved = maxBytes ?? DEFAULT_MAX_SESSION_TRANSCRIPT_BYTES;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new RangeError(`Invalid session transcript capacity: ${resolved}`);
  }
  return resolved;
}

function normalizeSegmentCapacity(segmentBytes: number | undefined, maxBytes: number): number {
  const resolved = Math.min(segmentBytes ?? DEFAULT_SESSION_TRANSCRIPT_SEGMENT_BYTES, maxBytes);
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new RangeError(`Invalid session transcript segment capacity: ${resolved}`);
  }
  return resolved;
}

function normalizePositiveInteger(
  value: number | undefined,
  fallback: number,
  name: string
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new RangeError(`Invalid ${name}: ${resolved}`);
  }
  return resolved;
}

function takeUtf8ByteTail(buffer: Buffer, maxBytes: number): Buffer {
  if (maxBytes <= 0 || buffer.length === 0) {
    return Buffer.alloc(0);
  }

  const requestedStart = Math.max(0, buffer.length - maxBytes);
  const candidate = buffer.subarray(requestedStart);
  const safeStart = findSafeUtf8Start(candidate);
  const safeEnd = findSafeUtf8End(candidate, safeStart);
  return Buffer.from(candidate.subarray(safeStart, safeEnd));
}

function takeUtf8BytePrefix(buffer: Buffer, maxBytes: number): Buffer {
  if (maxBytes <= 0 || buffer.length === 0) {
    return Buffer.alloc(0);
  }

  const requestedEnd = Math.min(buffer.length, maxBytes);
  const candidate = buffer.subarray(0, requestedEnd);
  const safeEnd = findSafeUtf8End(candidate, 0);
  if (safeEnd > 0) {
    return Buffer.from(candidate.subarray(0, safeEnd));
  }

  const sequenceLength = getUtf8SequenceLength(buffer[0]);
  return Buffer.from(buffer.subarray(0, Math.min(buffer.length, sequenceLength)));
}

function getDefaultRootDirectory(): string {
  return join(homedir(), RUNTIME_STATE_DIRNAME, SESSION_TRANSCRIPT_ARCHIVE_DIRNAME);
}

function createEmptyState(): TranscriptState {
  return { segments: [], retainedBytes: 0, dirty: false };
}

export class SessionTranscriptArchive {
  private readonly rootDirectory: string;
  private readonly maxBytes: number;
  private readonly segmentBytes: number;
  private readonly appendDelayMs: number;
  private readonly maxPendingAppendBytes: number;
  private readonly queues = new Map<string, Promise<void>>();
  private readonly pendingAppends = new Map<string, PendingTranscriptAppend>();
  private readonly openedSessionIds = new Set<string>();
  private readonly failures = new Map<string, Error>();
  private readonly states = new Map<string, TranscriptState>();

  constructor(options: SessionTranscriptArchiveOptions = {}) {
    this.rootDirectory = options.rootDirectory ?? getDefaultRootDirectory();
    this.maxBytes = normalizeArchiveCapacity(options.maxBytes);
    this.segmentBytes = normalizeSegmentCapacity(options.segmentBytes, this.maxBytes);
    this.appendDelayMs = normalizePositiveInteger(
      options.appendDelayMs,
      DEFAULT_SESSION_TRANSCRIPT_APPEND_DELAY_MS,
      'session transcript append delay'
    );
    this.maxPendingAppendBytes = Math.min(
      normalizePositiveInteger(
        options.maxPendingAppendBytes,
        DEFAULT_SESSION_TRANSCRIPT_PENDING_APPEND_BYTES,
        'session transcript pending append size'
      ),
      this.maxBytes
    );
  }

  async open(sessionId: string): Promise<void> {
    const normalizedSessionId = this.validateSessionId(sessionId);
    await this.enqueue(normalizedSessionId, () => this.ensureOpen(normalizedSessionId));
  }

  append(sessionId: string, data: string): void {
    const normalizedSessionId = this.validateSessionId(sessionId);
    if (!data) {
      return;
    }

    this.queuePendingAppend(
      normalizedSessionId,
      takeUtf8ByteTail(Buffer.from(data, 'utf8'), this.maxBytes)
    );
  }

  async flush(sessionId: string): Promise<void> {
    const normalizedSessionId = this.validateSessionId(sessionId);
    await this.flushPendingAppend(normalizedSessionId);
    const pending = this.queues.get(normalizedSessionId);
    if (pending) {
      await pending.catch(() => undefined);
    }

    await this.enqueue(normalizedSessionId, async () => {
      const state = this.states.get(normalizedSessionId);
      if (state?.dirty) {
        await this.writeManifest(normalizedSessionId, state);
        state.dirty = false;
      }
    });

    const failure = this.failures.get(normalizedSessionId);
    if (failure) {
      throw failure;
    }
  }

  async readPage(
    request: SessionTranscriptArchivePageRequest
  ): Promise<SessionTranscriptArchivePage> {
    const sessionId = this.validateSessionId(request.sessionId);
    const maxBytes = normalizePageSize(request.maxBytes);
    await this.flush(sessionId);

    const v2State = await this.loadV2State(sessionId);
    if (v2State) {
      return this.readV2Page(sessionId, v2State, request.beforeByteOffset, maxBytes);
    }

    return this.readLegacyPage(sessionId, request.beforeByteOffset, maxBytes);
  }

  getDiagnostics(sessionId: string): SessionTranscriptArchiveDiagnostics {
    const normalizedSessionId = this.validateSessionId(sessionId);
    const state = this.states.get(normalizedSessionId);
    const pending = this.pendingAppends.get(normalizedSessionId);
    return {
      retainedBytes: state?.retainedBytes ?? 0,
      segmentCount: state?.segments.length ?? 0,
      pendingAppendBytes: (pending?.byteLength ?? 0) + (pending?.inFlightByteLength ?? 0),
    };
  }

  async delete(sessionId: string): Promise<void> {
    const normalizedSessionId = this.validateSessionId(sessionId);
    this.discardPendingAppend(normalizedSessionId);
    const deletion = this.enqueue(normalizedSessionId, async () => {
      await Promise.all([
        rm(this.getLegacyFilePath(normalizedSessionId), { force: true }),
        rm(this.getV2SessionDirectory(normalizedSessionId), { force: true, recursive: true }),
      ]);
      this.openedSessionIds.delete(normalizedSessionId);
      this.states.delete(normalizedSessionId);
    });
    await deletion;
    if (this.queues.get(normalizedSessionId) === deletion) {
      this.queues.delete(normalizedSessionId);
      this.failures.delete(normalizedSessionId);
    }
  }

  private enqueue(sessionId: string, operation: () => Promise<void>): Promise<void> {
    const previous = this.queues.get(sessionId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    this.queues.set(sessionId, next);
    void next.then(
      () => {
        if (this.queues.get(sessionId) === next) {
          this.failures.delete(sessionId);
        }
      },
      (error) => {
        if (this.queues.get(sessionId) === next) {
          this.failures.set(sessionId, error instanceof Error ? error : new Error(String(error)));
        }
      }
    );
    return next;
  }

  private async ensureOpen(sessionId: string): Promise<void> {
    if (this.openedSessionIds.has(sessionId)) {
      return;
    }

    await mkdir(this.rootDirectory, { recursive: true, mode: 0o700 });
    let state = await this.loadV2State(sessionId);
    if (!state) {
      state = await this.createStateFromLegacyTranscript(sessionId);
    }

    this.states.set(sessionId, state);
    await this.writeManifest(sessionId, state);
    state.dirty = false;
    this.openedSessionIds.add(sessionId);
  }

  private queuePendingAppend(sessionId: string, data: Buffer): void {
    if (data.length === 0) {
      return;
    }

    const pending = this.getPendingAppend(sessionId);
    pending.buffers.push(data);
    pending.byteLength += data.length;
    pending.latestSequence += 1;
    this.compactPendingAppend(pending);

    if (pending.inFlight) {
      return;
    }
    if (pending.byteLength >= this.maxPendingAppendBytes) {
      this.startPendingAppendDrain(sessionId, pending);
      return;
    }
    this.schedulePendingAppendDrain(sessionId, pending);
  }

  private getPendingAppend(sessionId: string): PendingTranscriptAppend {
    const existing = this.pendingAppends.get(sessionId);
    if (existing) {
      return existing;
    }

    const created: PendingTranscriptAppend = {
      buffers: [],
      byteLength: 0,
      latestSequence: 0,
      completedSequence: 0,
      inFlightByteLength: 0,
    };
    this.pendingAppends.set(sessionId, created);
    return created;
  }

  private compactPendingAppend(pending: PendingTranscriptAppend): void {
    if (pending.byteLength <= this.maxPendingAppendBytes) {
      return;
    }

    const retained = takeUtf8ByteTail(
      Buffer.concat(pending.buffers, pending.byteLength),
      this.maxPendingAppendBytes
    );
    pending.buffers = retained.length > 0 ? [retained] : [];
    pending.byteLength = retained.length;
  }

  private schedulePendingAppendDrain(sessionId: string, pending: PendingTranscriptAppend): void {
    if (pending.timer || pending.byteLength === 0) {
      return;
    }

    pending.timer = setTimeout(() => {
      pending.timer = undefined;
      this.startPendingAppendDrain(sessionId, pending);
    }, this.appendDelayMs);
  }

  private startPendingAppendDrain(sessionId: string, pending: PendingTranscriptAppend): void {
    if (pending.inFlight || pending.byteLength === 0) {
      return;
    }

    if (pending.timer) {
      clearTimeout(pending.timer);
      pending.timer = undefined;
    }

    const buffers = pending.buffers;
    const byteLength = pending.byteLength;
    const sequence = pending.latestSequence;
    pending.buffers = [];
    pending.byteLength = 0;
    pending.inFlightByteLength = byteLength;

    const operation = this.enqueue(sessionId, async () => {
      await this.ensureOpen(sessionId);
      await this.appendBounded(sessionId, Buffer.concat(buffers, byteLength));
    });
    pending.inFlight = operation;
    void operation.then(
      () => {
        if (this.pendingAppends.get(sessionId) !== pending) {
          return;
        }
        pending.completedSequence = sequence;
        pending.inFlight = undefined;
        pending.inFlightByteLength = 0;
        this.completePendingAppendDrain(sessionId, pending);
      },
      () => {
        if (this.pendingAppends.get(sessionId) !== pending) {
          return;
        }
        pending.inFlight = undefined;
        pending.inFlightByteLength = 0;
        this.completePendingAppendDrain(sessionId, pending);
      }
    );
  }

  private completePendingAppendDrain(sessionId: string, pending: PendingTranscriptAppend): void {
    if (pending.byteLength === 0) {
      this.pendingAppends.delete(sessionId);
      return;
    }
    if (pending.byteLength >= this.maxPendingAppendBytes) {
      this.startPendingAppendDrain(sessionId, pending);
      return;
    }
    this.schedulePendingAppendDrain(sessionId, pending);
  }

  private async flushPendingAppend(sessionId: string): Promise<void> {
    const pending = this.pendingAppends.get(sessionId);
    if (!pending) {
      return;
    }

    const targetSequence = pending.latestSequence;
    while (pending.completedSequence < targetSequence) {
      this.startPendingAppendDrain(sessionId, pending);
      const inFlight = pending.inFlight;
      if (!inFlight) {
        return;
      }
      try {
        await inFlight;
      } catch {
        return;
      }
    }
  }

  private discardPendingAppend(sessionId: string): void {
    const pending = this.pendingAppends.get(sessionId);
    if (!pending) {
      return;
    }
    if (pending.timer) {
      clearTimeout(pending.timer);
    }
    this.pendingAppends.delete(sessionId);
  }

  private async createStateFromLegacyTranscript(sessionId: string): Promise<TranscriptState> {
    const state = createEmptyState();
    await mkdir(this.getSegmentsDirectory(sessionId), { recursive: true, mode: 0o700 });

    let legacyOutput: Buffer;
    try {
      legacyOutput = await readFile(this.getLegacyFilePath(sessionId));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return state;
      }
      throw error;
    }

    await this.writeBufferToSegments(
      sessionId,
      state,
      takeUtf8ByteTail(legacyOutput, this.maxBytes)
    );
    state.dirty = true;
    return state;
  }

  private async appendBounded(sessionId: string, data: Buffer): Promise<void> {
    const state = this.states.get(sessionId);
    if (!state) {
      throw new Error(`Session transcript state is not open: ${sessionId}`);
    }

    const incoming = takeUtf8ByteTail(data, this.maxBytes);
    if (incoming.length === 0) {
      return;
    }

    await this.writeBufferToSegments(sessionId, state, incoming);
    await this.trimToCapacity(sessionId, state);
    state.dirty = true;
  }

  private async writeBufferToSegments(
    sessionId: string,
    state: TranscriptState,
    input: Buffer
  ): Promise<void> {
    let remaining = input;
    while (remaining.length > 0) {
      const tail = state.segments.at(-1);
      const availableBytes = tail ? this.segmentBytes - tail.byteLength : this.segmentBytes;
      if (tail && availableBytes > 0) {
        const chunk = takeUtf8BytePrefix(remaining, availableBytes);
        await this.appendToSegment(sessionId, state, tail, chunk);
        remaining = remaining.subarray(chunk.length);
        continue;
      }

      const segment: TranscriptSegment = {
        id: this.getNextSegmentId(state),
        byteLength: 0,
      };
      state.segments.push(segment);
      const chunk = takeUtf8BytePrefix(remaining, this.segmentBytes);
      await this.appendToSegment(sessionId, state, segment, chunk);
      remaining = remaining.subarray(chunk.length);
    }
  }

  private async appendToSegment(
    sessionId: string,
    state: TranscriptState,
    segment: TranscriptSegment,
    chunk: Buffer
  ): Promise<void> {
    if (chunk.length === 0) {
      throw new Error('Session transcript segment append cannot be empty');
    }

    const filePath = this.getSegmentPath(sessionId, segment.id);
    await writeFile(filePath, chunk, { flag: 'a', mode: 0o600 });
    segment.byteLength += chunk.length;
    state.retainedBytes += chunk.length;
  }

  private async trimToCapacity(sessionId: string, state: TranscriptState): Promise<void> {
    while (state.retainedBytes > this.maxBytes && state.segments.length > 0) {
      const oldest = state.segments[0];
      const excessBytes = state.retainedBytes - this.maxBytes;
      if (oldest.byteLength <= excessBytes) {
        await rm(this.getSegmentPath(sessionId, oldest.id), { force: true });
        state.segments.shift();
        state.retainedBytes -= oldest.byteLength;
        continue;
      }

      const contents = await readFile(this.getSegmentPath(sessionId, oldest.id));
      const retained = takeUtf8ByteTail(contents, oldest.byteLength - excessBytes);
      await writeFile(this.getSegmentPath(sessionId, oldest.id), retained, { mode: 0o600 });
      oldest.byteLength = retained.length;
      state.retainedBytes -= contents.length - retained.length;
    }
  }

  private async loadV2State(sessionId: string): Promise<TranscriptState | undefined> {
    const cached = this.states.get(sessionId);
    if (cached) {
      return cached;
    }

    const segmentsDirectory = this.getSegmentsDirectory(sessionId);
    let entries: Dirent[];
    try {
      entries = await readdir(segmentsDirectory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }

    const segments = (
      await Promise.all(
        entries.map(async (entry) => {
          const match = entry.isFile()
            ? SESSION_TRANSCRIPT_SEGMENT_FILE_PATTERN.exec(entry.name)
            : null;
          if (!match) {
            return undefined;
          }

          const info = await stat(join(segmentsDirectory, entry.name));
          return { id: Number(match[1]), byteLength: info.size } satisfies TranscriptSegment;
        })
      )
    )
      .filter((segment): segment is TranscriptSegment => segment !== undefined)
      .sort((left, right) => left.id - right.id);

    const state: TranscriptState = {
      segments,
      retainedBytes: segments.reduce((total, segment) => total + segment.byteLength, 0),
      dirty: false,
    };
    this.states.set(sessionId, state);
    return state;
  }

  private async writeManifest(sessionId: string, state: TranscriptState): Promise<void> {
    const sessionDirectory = this.getV2SessionDirectory(sessionId);
    await mkdir(sessionDirectory, { recursive: true, mode: 0o700 });
    const manifest: TranscriptManifest = {
      version: SESSION_TRANSCRIPT_MANIFEST_VERSION,
      retainedBytes: state.retainedBytes,
      segments: state.segments,
    };
    const manifestPath = this.getManifestPath(sessionId);
    const temporaryPath = `${manifestPath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(manifest), { encoding: 'utf8', mode: 0o600 });
    await rename(temporaryPath, manifestPath);
    await chmod(manifestPath, 0o600);
  }

  private async readV2Page(
    sessionId: string,
    state: TranscriptState,
    beforeByteOffset: number | undefined,
    maxBytes: number
  ): Promise<SessionTranscriptArchivePage> {
    const endByteOffset = normalizeBeforeByteOffset(beforeByteOffset, state.retainedBytes);
    const requestedStartByteOffset = Math.max(0, endByteOffset - maxBytes);
    const chunks: Buffer[] = [];
    let segmentStartByteOffset = 0;

    for (const segment of state.segments) {
      const segmentEndByteOffset = segmentStartByteOffset + segment.byteLength;
      const startInSegment = Math.max(0, requestedStartByteOffset - segmentStartByteOffset);
      const endInSegment = Math.min(segment.byteLength, endByteOffset - segmentStartByteOffset);
      if (endInSegment > startInSegment) {
        const contents = await readFile(this.getSegmentPath(sessionId, segment.id));
        chunks.push(contents.subarray(startInSegment, endInSegment));
      }
      if (segmentEndByteOffset >= endByteOffset) {
        break;
      }
      segmentStartByteOffset = segmentEndByteOffset;
    }

    const pageBuffer = Buffer.concat(chunks);
    const safeStartOffset = findSafeUtf8Start(pageBuffer);
    const safeEndOffset = findSafeUtf8End(pageBuffer, safeStartOffset);
    const startByteOffset = requestedStartByteOffset + safeStartOffset;

    return {
      text: pageBuffer.subarray(safeStartOffset, safeEndOffset).toString('utf8'),
      startByteOffset,
      endByteOffset: requestedStartByteOffset + safeEndOffset,
      hasMore: startByteOffset > 0,
      totalBytes: state.retainedBytes,
      health: this.failures.has(sessionId) ? 'degraded' : 'complete',
    };
  }

  private async readLegacyPage(
    sessionId: string,
    beforeByteOffset: number | undefined,
    maxBytes: number
  ): Promise<SessionTranscriptArchivePage> {
    let file: FileHandle;
    try {
      file = await openFile(this.getLegacyFilePath(sessionId), 'r');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          text: '',
          startByteOffset: 0,
          endByteOffset: 0,
          hasMore: false,
          totalBytes: 0,
          health: this.failures.has(sessionId) ? 'degraded' : 'unavailable',
        };
      }
      throw error;
    }

    try {
      const { size } = await file.stat();
      const endByteOffset = normalizeBeforeByteOffset(beforeByteOffset, size);
      const requestedStartByteOffset = Math.max(0, endByteOffset - maxBytes);
      const buffer = Buffer.alloc(endByteOffset - requestedStartByteOffset);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, requestedStartByteOffset);
      const pageBuffer = buffer.subarray(0, bytesRead);
      const safeStartOffset = findSafeUtf8Start(pageBuffer);
      const safeEndOffset = findSafeUtf8End(pageBuffer, safeStartOffset);
      const startByteOffset = requestedStartByteOffset + safeStartOffset;

      return {
        text: pageBuffer.subarray(safeStartOffset, safeEndOffset).toString('utf8'),
        startByteOffset,
        endByteOffset: requestedStartByteOffset + safeEndOffset,
        hasMore: startByteOffset > 0,
        totalBytes: size,
        health: this.failures.has(sessionId) ? 'degraded' : 'complete',
      };
    } finally {
      await file.close();
    }
  }

  private getNextSegmentId(state: TranscriptState): number {
    const lastSegmentId = state.segments.at(-1)?.id;
    return lastSegmentId === undefined ? 0 : lastSegmentId + 1;
  }

  private getV2SessionDirectory(sessionId: string): string {
    return join(this.rootDirectory, SESSION_TRANSCRIPT_V2_DIRECTORY_NAME, sessionId);
  }

  private getSegmentsDirectory(sessionId: string): string {
    return join(this.getV2SessionDirectory(sessionId), SESSION_TRANSCRIPT_SEGMENTS_DIRECTORY_NAME);
  }

  private getSegmentPath(sessionId: string, segmentId: number): string {
    return join(
      this.getSegmentsDirectory(sessionId),
      `${segmentId.toString().padStart(20, '0')}${SESSION_TRANSCRIPT_SEGMENT_FILE_SUFFIX}`
    );
  }

  private getManifestPath(sessionId: string): string {
    return join(this.getV2SessionDirectory(sessionId), SESSION_TRANSCRIPT_MANIFEST_FILE_NAME);
  }

  private getLegacyFilePath(sessionId: string): string {
    return join(this.rootDirectory, `${sessionId}${SESSION_TRANSCRIPT_FILENAME_SUFFIX}`);
  }

  private validateSessionId(sessionId: string): string {
    if (!SESSION_TRANSCRIPT_IDENTIFIER_PATTERN.test(sessionId)) {
      throw new Error(`Invalid session transcript identifier: ${sessionId}`);
    }
    return sessionId;
  }
}

export const sessionTranscriptArchive = new SessionTranscriptArchive();
