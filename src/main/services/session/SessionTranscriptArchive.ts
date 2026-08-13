import {
  appendFile,
  chmod,
  type FileHandle,
  mkdir,
  open as openFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { RUNTIME_STATE_DIRNAME } from '@shared/paths';
import type { SessionTranscriptHealth } from '@shared/types';

const SESSION_TRANSCRIPT_ARCHIVE_DIRNAME = 'session-transcripts';
const SESSION_TRANSCRIPT_FILENAME_SUFFIX = '.log';
const SESSION_TRANSCRIPT_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/u;

export const MAX_SESSION_TRANSCRIPT_PAGE_BYTES = 256 * 1024;
export const DEFAULT_MAX_SESSION_TRANSCRIPT_BYTES = 32 * 1024 * 1024;

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

export interface SessionTranscriptArchiveOptions {
  rootDirectory?: string;
  maxBytes?: number;
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

function getDefaultRootDirectory(): string {
  return join(homedir(), RUNTIME_STATE_DIRNAME, SESSION_TRANSCRIPT_ARCHIVE_DIRNAME);
}

export class SessionTranscriptArchive {
  private readonly rootDirectory: string;
  private readonly maxBytes: number;
  private readonly queues = new Map<string, Promise<void>>();
  private readonly openedSessionIds = new Set<string>();
  private readonly failures = new Map<string, Error>();

  constructor(options: SessionTranscriptArchiveOptions = {}) {
    this.rootDirectory = options.rootDirectory ?? getDefaultRootDirectory();
    this.maxBytes = normalizeArchiveCapacity(options.maxBytes);
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

    void this.enqueue(normalizedSessionId, async () => {
      await this.ensureOpen(normalizedSessionId);
      await this.appendBounded(normalizedSessionId, data);
    });
  }

  async flush(sessionId: string): Promise<void> {
    const normalizedSessionId = this.validateSessionId(sessionId);
    const pending = this.queues.get(normalizedSessionId);
    if (pending) {
      await pending.catch(() => undefined);
    }

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

    let file: FileHandle;
    try {
      file = await openFile(this.getFilePath(sessionId), 'r');
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
      const endByteOffset = normalizeBeforeByteOffset(request.beforeByteOffset, size);
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

  async delete(sessionId: string): Promise<void> {
    const normalizedSessionId = this.validateSessionId(sessionId);
    const deletion = this.enqueue(normalizedSessionId, async () => {
      await rm(this.getFilePath(normalizedSessionId), { force: true });
      this.openedSessionIds.delete(normalizedSessionId);
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
    const filePath = this.getFilePath(sessionId);
    await writeFile(filePath, '', { encoding: 'utf8', flag: 'a', mode: 0o600 });
    await chmod(filePath, 0o600);
    this.openedSessionIds.add(sessionId);
  }

  private async appendBounded(sessionId: string, data: string): Promise<void> {
    const filePath = this.getFilePath(sessionId);
    const incoming = takeUtf8ByteTail(Buffer.from(data, 'utf8'), this.maxBytes);
    if (incoming.length === 0) {
      return;
    }

    const file = await openFile(filePath, 'r');
    let size: number;
    try {
      ({ size } = await file.stat());
      if (size + incoming.length <= this.maxBytes) {
        await appendFile(filePath, incoming);
        return;
      }

      const retainedBytes = Math.max(0, this.maxBytes - incoming.length);
      const existing = await this.readUtf8Tail(file, size, retainedBytes);
      await writeFile(filePath, Buffer.concat([existing, incoming]));
    } finally {
      await file.close();
    }
  }

  private async readUtf8Tail(file: FileHandle, size: number, maxBytes: number): Promise<Buffer> {
    if (maxBytes <= 0 || size <= 0) {
      return Buffer.alloc(0);
    }

    const requestedStart = Math.max(0, size - maxBytes);
    const buffer = Buffer.alloc(size - requestedStart);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, requestedStart);
    return takeUtf8ByteTail(buffer.subarray(0, bytesRead), maxBytes);
  }

  private getFilePath(sessionId: string): string {
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
