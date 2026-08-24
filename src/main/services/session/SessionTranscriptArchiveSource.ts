export function getSessionTranscriptArchiveRuntimeSource(): string {
  return `
const SESSION_TRANSCRIPT_ARCHIVE_DIRNAME = 'session-transcripts';
const SESSION_TRANSCRIPT_FILENAME_SUFFIX = '.log';
const SESSION_TRANSCRIPT_V2_DIRECTORY_NAME = 'v2';
const SESSION_TRANSCRIPT_SEGMENTS_DIRECTORY_NAME = 'segments';
const SESSION_TRANSCRIPT_MANIFEST_FILE_NAME = 'manifest.json';
const SESSION_TRANSCRIPT_MANIFEST_VERSION = 2;
const SESSION_TRANSCRIPT_SEGMENT_FILE_SUFFIX = '.log';
const SESSION_TRANSCRIPT_MAX_BYTES = 32 * 1024 * 1024;
const SESSION_TRANSCRIPT_SEGMENT_BYTES = 1024 * 1024;
const SESSION_TRANSCRIPT_MAX_PAGE_BYTES = 256 * 1024;
const SESSION_TRANSCRIPT_APPEND_DELAY_MS = 16;
const SESSION_TRANSCRIPT_PENDING_APPEND_BYTES = 512 * 1024;
const SESSION_TRANSCRIPT_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/;
const SESSION_TRANSCRIPT_SEGMENT_FILE_PATTERN = /^(\\d{20})\\.log$/;
const SESSION_TRANSCRIPT_ESC = 0x1b;
const SESSION_TRANSCRIPT_BEL = 0x07;
const SESSION_TRANSCRIPT_CANCEL = 0x18;
const SESSION_TRANSCRIPT_SUBSTITUTE = 0x1a;
const SESSION_TRANSCRIPT_STRING_TERMINATOR = 0x9c;
const SESSION_TRANSCRIPT_C1_DCS = 0x90;
const SESSION_TRANSCRIPT_C1_CSI = 0x9b;
const SESSION_TRANSCRIPT_C1_OSC = 0x9d;
const SESSION_TRANSCRIPT_C1_SOS = 0x98;
const SESSION_TRANSCRIPT_C1_PM = 0x9e;
const SESSION_TRANSCRIPT_C1_APC = 0x9f;
const sessionTranscriptQueues = new Map();
const sessionTranscriptPendingAppends = new Map();
const sessionTranscriptOpenedIds = new Set();
const sessionTranscriptFailures = new Map();
const sessionTranscriptStates = new Map();
const sessionTranscriptIncompleteTerminalReplayMetadataIds = new Set();

function normalizeSessionTranscriptId(sessionId) {
  if (
    typeof sessionId !== 'string' ||
    !SESSION_TRANSCRIPT_IDENTIFIER_PATTERN.test(sessionId)
  ) {
    throw new Error('Invalid session transcript identifier: ' + sessionId);
  }
  return sessionId;
}

function getSessionTranscriptDirectory() {
  return path.join(getSessionTranscriptRootDirectory(), SESSION_TRANSCRIPT_ARCHIVE_DIRNAME);
}

function getLegacySessionTranscriptPath(sessionId) {
  return path.join(
    getSessionTranscriptDirectory(),
    normalizeSessionTranscriptId(sessionId) + SESSION_TRANSCRIPT_FILENAME_SUFFIX
  );
}

function getSessionTranscriptV2Directory(sessionId) {
  return path.join(
    getSessionTranscriptDirectory(),
    SESSION_TRANSCRIPT_V2_DIRECTORY_NAME,
    normalizeSessionTranscriptId(sessionId)
  );
}

function getSessionTranscriptSegmentsDirectory(sessionId) {
  return path.join(
    getSessionTranscriptV2Directory(sessionId),
    SESSION_TRANSCRIPT_SEGMENTS_DIRECTORY_NAME
  );
}

function getSessionTranscriptSegmentPath(sessionId, segmentId) {
  return path.join(
    getSessionTranscriptSegmentsDirectory(sessionId),
    String(segmentId).padStart(20, '0') + SESSION_TRANSCRIPT_SEGMENT_FILE_SUFFIX
  );
}

function getSessionTranscriptManifestPath(sessionId) {
  return path.join(getSessionTranscriptV2Directory(sessionId), SESSION_TRANSCRIPT_MANIFEST_FILE_NAME);
}

function createEmptySessionTranscriptState() {
  return {
    segments: [],
    retainedBytes: 0,
    dirty: false,
    terminalReplayMetadataComplete: true,
    terminalReplayStateAtEnd: 'text',
    terminalReplayStatesBySegmentId: new Map(),
  };
}

function isSessionTranscriptAgent(session) {
  return Boolean(session && session.kind === 'agent');
}

function recordSessionTranscriptFailure(sessionId, error) {
  const normalizedError = error instanceof Error ? error : new Error(String(error));
  sessionTranscriptFailures.set(sessionId, normalizedError);
  console.warn('[session-transcript] Archive operation failed:', {
    sessionId,
    error: normalizedError.message,
  });
}

function enqueueSessionTranscriptOperation(sessionId, operation) {
  const normalizedSessionId = normalizeSessionTranscriptId(sessionId);
  const previous = sessionTranscriptQueues.get(normalizedSessionId) || Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  sessionTranscriptQueues.set(normalizedSessionId, next);
  void next.then(
    () => {
      if (sessionTranscriptQueues.get(normalizedSessionId) === next) {
        sessionTranscriptFailures.delete(normalizedSessionId);
      }
    },
    (error) => {
      if (sessionTranscriptQueues.get(normalizedSessionId) === next) {
        recordSessionTranscriptFailure(normalizedSessionId, error);
      }
    }
  );
  return next;
}

function isUtf8ContinuationByte(value) {
  return value !== undefined && value >= 0x80 && value <= 0xbf;
}

function getUtf8SequenceLength(value) {
  if (value === undefined || value <= 0x7f) return 1;
  if (value >= 0xc2 && value <= 0xdf) return 2;
  if (value >= 0xe0 && value <= 0xef) return 3;
  if (value >= 0xf0 && value <= 0xf4) return 4;
  return 1;
}

function findSessionTranscriptUtf8Start(buffer) {
  let start = 0;
  while (start < buffer.length && isUtf8ContinuationByte(buffer[start])) {
    start += 1;
  }
  return start;
}

function findSessionTranscriptUtf8End(buffer, start) {
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

function takeSessionTranscriptUtf8Tail(buffer, maxBytes) {
  if (maxBytes <= 0 || buffer.length === 0) {
    return Buffer.alloc(0);
  }

  const requestedStart = Math.max(0, buffer.length - maxBytes);
  const candidate = buffer.subarray(requestedStart);
  const safeStart = findSessionTranscriptUtf8Start(candidate);
  const safeEnd = findSessionTranscriptUtf8End(candidate, safeStart);
  return Buffer.from(candidate.subarray(safeStart, safeEnd));
}

function takeSessionTranscriptUtf8Prefix(buffer, maxBytes) {
  if (maxBytes <= 0 || buffer.length === 0) {
    return Buffer.alloc(0);
  }

  const requestedEnd = Math.min(buffer.length, maxBytes);
  const candidate = buffer.subarray(0, requestedEnd);
  const safeEnd = findSessionTranscriptUtf8End(candidate, 0);
  if (safeEnd > 0) {
    return Buffer.from(candidate.subarray(0, safeEnd));
  }

  const sequenceLength = getUtf8SequenceLength(buffer[0]);
  return Buffer.from(buffer.subarray(0, Math.min(buffer.length, sequenceLength)));
}

function isSessionTranscriptStringIntroducer(codeUnit) {
  return (
    codeUnit === SESSION_TRANSCRIPT_C1_DCS ||
    codeUnit === SESSION_TRANSCRIPT_C1_SOS ||
    codeUnit === SESSION_TRANSCRIPT_C1_PM ||
    codeUnit === SESSION_TRANSCRIPT_C1_APC
  );
}

function isSessionTranscriptControlCancellation(codeUnit) {
  return codeUnit === SESSION_TRANSCRIPT_CANCEL || codeUnit === SESSION_TRANSCRIPT_SUBSTITUTE;
}

function isSessionTranscriptEscapeIntermediate(codeUnit) {
  return codeUnit >= 0x20 && codeUnit <= 0x2f;
}

function resolveSessionTranscriptEscapeState(codeUnit) {
  if (isSessionTranscriptControlCancellation(codeUnit)) return 'text';
  if (codeUnit === SESSION_TRANSCRIPT_ESC) return 'escape';
  if (codeUnit === 0x5b) return 'csi';
  if (codeUnit === 0x5d) return 'osc';
  if (codeUnit === 0x50 || codeUnit === 0x58 || codeUnit === 0x5e || codeUnit === 0x5f) {
    return 'string';
  }
  if (codeUnit === SESSION_TRANSCRIPT_C1_CSI) return 'csi';
  if (codeUnit === SESSION_TRANSCRIPT_C1_OSC) return 'osc';
  if (isSessionTranscriptStringIntroducer(codeUnit)) return 'string';
  return isSessionTranscriptEscapeIntermediate(codeUnit) ? 'escapeIntermediate' : 'text';
}

function advanceSessionTranscriptTerminalReplayParserState(state, codeUnit) {
  if (state === 'text') {
    if (codeUnit === SESSION_TRANSCRIPT_ESC) return 'escape';
    if (codeUnit === SESSION_TRANSCRIPT_C1_CSI) return 'csi';
    if (codeUnit === SESSION_TRANSCRIPT_C1_OSC) return 'osc';
    return isSessionTranscriptStringIntroducer(codeUnit) ? 'string' : 'text';
  }

  if (state === 'escape') return resolveSessionTranscriptEscapeState(codeUnit);

  if (state === 'escapeIntermediate') {
    if (isSessionTranscriptControlCancellation(codeUnit)) return 'text';
    if (codeUnit === SESSION_TRANSCRIPT_ESC) return 'escape';
    if (isSessionTranscriptEscapeIntermediate(codeUnit)) return 'escapeIntermediate';
    if (codeUnit === SESSION_TRANSCRIPT_C1_CSI) return 'csi';
    if (codeUnit === SESSION_TRANSCRIPT_C1_OSC) return 'osc';
    return isSessionTranscriptStringIntroducer(codeUnit) ? 'string' : 'text';
  }

  if (state === 'csi') {
    if (isSessionTranscriptControlCancellation(codeUnit)) return 'text';
    if (codeUnit === SESSION_TRANSCRIPT_ESC) return 'escape';
    if (codeUnit >= 0x40 && codeUnit <= 0x7e) return 'text';
    if (codeUnit === SESSION_TRANSCRIPT_C1_CSI) return 'csi';
    if (codeUnit === SESSION_TRANSCRIPT_C1_OSC) return 'osc';
    return isSessionTranscriptStringIntroducer(codeUnit) ? 'string' : 'csi';
  }

  if (state === 'osc') {
    if (isSessionTranscriptControlCancellation(codeUnit)) return 'text';
    if (
      codeUnit === SESSION_TRANSCRIPT_BEL ||
      codeUnit === SESSION_TRANSCRIPT_STRING_TERMINATOR
    ) {
      return 'text';
    }
    return codeUnit === SESSION_TRANSCRIPT_ESC ? 'oscEscape' : 'osc';
  }

  if (state === 'string') {
    if (isSessionTranscriptControlCancellation(codeUnit)) return 'text';
    if (codeUnit === SESSION_TRANSCRIPT_STRING_TERMINATOR) return 'text';
    return codeUnit === SESSION_TRANSCRIPT_ESC ? 'stringEscape' : 'string';
  }

  if (state === 'oscEscape') {
    if (isSessionTranscriptControlCancellation(codeUnit)) return 'text';
    if (
      codeUnit === 0x5c ||
      codeUnit === SESSION_TRANSCRIPT_BEL ||
      codeUnit === SESSION_TRANSCRIPT_STRING_TERMINATOR
    ) {
      return 'text';
    }
    return codeUnit === SESSION_TRANSCRIPT_ESC ? 'oscEscape' : 'osc';
  }

  if (isSessionTranscriptControlCancellation(codeUnit)) return 'text';
  if (codeUnit === 0x5c || codeUnit === SESSION_TRANSCRIPT_STRING_TERMINATOR) return 'text';
  return codeUnit === SESSION_TRANSCRIPT_ESC ? 'stringEscape' : 'string';
}

function resolveSessionTranscriptTerminalReplayParserState(value, initialState = 'text') {
  let state = initialState;
  for (let index = 0; index < value.length; index += 1) {
    state = advanceSessionTranscriptTerminalReplayParserState(state, value.charCodeAt(index));
  }
  return state;
}

function isSessionTranscriptTerminalReplayParserState(value) {
  return (
    value === 'text' ||
    value === 'escape' ||
    value === 'escapeIntermediate' ||
    value === 'csi' ||
    value === 'osc' ||
    value === 'string' ||
    value === 'oscEscape' ||
    value === 'stringEscape'
  );
}

function createUnavailableSessionTranscriptTerminalReplayMetadata() {
  return {
    isComplete: false,
    stateAtEnd: 'text',
    statesBySegmentId: new Map(),
  };
}

async function loadSessionTranscriptTerminalReplayMetadata(sessionId, segments) {
  const unavailable = createUnavailableSessionTranscriptTerminalReplayMetadata();
  let manifest;
  try {
    manifest = JSON.parse(await fsp.readFile(getSessionTranscriptManifestPath(sessionId), 'utf8'));
  } catch {
    return unavailable;
  }
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    !Array.isArray(manifest.segments) ||
    !manifest.terminalReplay ||
    typeof manifest.terminalReplay !== 'object'
  ) {
    return unavailable;
  }
  if (
    manifest.segments.length !== segments.length ||
    !manifest.segments.every((entry, index) => {
      const segment = segments[index];
      return entry && entry.id === (segment && segment.id) && entry.byteLength === (segment && segment.byteLength);
    })
  ) {
    return unavailable;
  }

  const terminalReplay = manifest.terminalReplay;
  if (
    terminalReplay.isComplete !== true ||
    !isSessionTranscriptTerminalReplayParserState(terminalReplay.stateAtEnd) ||
    !terminalReplay.statesBySegmentId ||
    typeof terminalReplay.statesBySegmentId !== 'object'
  ) {
    return unavailable;
  }

  const statesBySegmentId = new Map();
  for (const segment of segments) {
    const parserState = terminalReplay.statesBySegmentId[String(segment.id)];
    if (!isSessionTranscriptTerminalReplayParserState(parserState)) {
      return unavailable;
    }
    statesBySegmentId.set(segment.id, parserState);
  }

  return {
    isComplete: true,
    stateAtEnd: terminalReplay.stateAtEnd,
    statesBySegmentId,
  };
}

async function loadSessionTranscriptV2State(sessionId) {
  const normalizedSessionId = normalizeSessionTranscriptId(sessionId);
  const cached = sessionTranscriptStates.get(normalizedSessionId);
  if (cached) {
    return cached;
  }

  const segmentsDirectory = getSessionTranscriptSegmentsDirectory(normalizedSessionId);
  let entries;
  try {
    entries = await fsp.readdir(segmentsDirectory, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }

  const segments = (
    await Promise.all(
      entries.map(async (entry) => {
        const match = entry.isFile() ? SESSION_TRANSCRIPT_SEGMENT_FILE_PATTERN.exec(entry.name) : null;
        if (!match) {
          return undefined;
        }

        const info = await fsp.stat(path.join(segmentsDirectory, entry.name));
        return {
          id: Number(match[1]),
          byteLength: info.size,
        };
      })
    )
  )
    .filter(Boolean)
    .sort((left, right) => left.id - right.id);

  const terminalReplayMetadata = await loadSessionTranscriptTerminalReplayMetadata(
    normalizedSessionId,
    segments
  );
  const state = {
    segments,
    retainedBytes: segments.reduce((total, segment) => total + segment.byteLength, 0),
    dirty: false,
    terminalReplayMetadataComplete: terminalReplayMetadata.isComplete,
    terminalReplayStateAtEnd: terminalReplayMetadata.stateAtEnd,
    terminalReplayStatesBySegmentId: terminalReplayMetadata.statesBySegmentId,
  };
  sessionTranscriptStates.set(normalizedSessionId, state);
  return state;
}

async function writeSessionTranscriptManifest(sessionId, state) {
  const normalizedSessionId = normalizeSessionTranscriptId(sessionId);
  const directory = getSessionTranscriptV2Directory(normalizedSessionId);
  await fsp.mkdir(directory, { recursive: true, mode: 0o700 });

  const manifest = {
    version: SESSION_TRANSCRIPT_MANIFEST_VERSION,
    retainedBytes: state.retainedBytes,
    segments: state.segments,
    terminalReplay: {
      isComplete: state.terminalReplayMetadataComplete,
      stateAtEnd: state.terminalReplayStateAtEnd,
      statesBySegmentId: Object.fromEntries(state.terminalReplayStatesBySegmentId),
    },
  };
  const manifestPath = getSessionTranscriptManifestPath(normalizedSessionId);
  const temporaryPath = manifestPath + '.' + process.pid + '.tmp';
  await fsp.writeFile(temporaryPath, JSON.stringify(manifest), { encoding: 'utf8', mode: 0o600 });
  await fsp.rename(temporaryPath, manifestPath);
  await fsp.chmod(manifestPath, 0o600);
}

function getNextSessionTranscriptSegmentId(state) {
  return state.segments.length === 0 ? 0 : state.segments[state.segments.length - 1].id + 1;
}

async function appendSessionTranscriptSegment(sessionId, state, segment, chunk) {
  if (chunk.length === 0) {
    throw new Error('Session transcript segment append cannot be empty');
  }

  const segmentPath = getSessionTranscriptSegmentPath(sessionId, segment.id);
  await fsp.writeFile(segmentPath, chunk, { flag: 'a', mode: 0o600 });
  segment.byteLength += chunk.length;
  state.retainedBytes += chunk.length;
  if (state.terminalReplayMetadataComplete) {
    state.terminalReplayStateAtEnd = resolveSessionTranscriptTerminalReplayParserState(
      chunk.toString('utf8'),
      state.terminalReplayStateAtEnd
    );
  }
}

async function writeSessionTranscriptBuffer(sessionId, state, input) {
  let remaining = input;
  while (remaining.length > 0) {
    const tail = state.segments[state.segments.length - 1];
    const availableBytes = tail
      ? SESSION_TRANSCRIPT_SEGMENT_BYTES - tail.byteLength
      : SESSION_TRANSCRIPT_SEGMENT_BYTES;
    if (tail && availableBytes > 0) {
      const chunk = takeSessionTranscriptUtf8Prefix(remaining, availableBytes);
      await appendSessionTranscriptSegment(sessionId, state, tail, chunk);
      remaining = remaining.subarray(chunk.length);
      continue;
    }

    const segment = {
      id: getNextSessionTranscriptSegmentId(state),
      byteLength: 0,
    };
    if (state.terminalReplayMetadataComplete) {
      state.terminalReplayStatesBySegmentId.set(segment.id, state.terminalReplayStateAtEnd);
    }
    state.segments.push(segment);
    const chunk = takeSessionTranscriptUtf8Prefix(remaining, SESSION_TRANSCRIPT_SEGMENT_BYTES);
    await appendSessionTranscriptSegment(sessionId, state, segment, chunk);
    remaining = remaining.subarray(chunk.length);
  }
}

async function trimSessionTranscriptToCapacity(sessionId, state) {
  while (state.retainedBytes > SESSION_TRANSCRIPT_MAX_BYTES && state.segments.length > 0) {
    const oldest = state.segments[0];
    const excessBytes = state.retainedBytes - SESSION_TRANSCRIPT_MAX_BYTES;
    if (oldest.byteLength <= excessBytes) {
      await fsp.rm(getSessionTranscriptSegmentPath(sessionId, oldest.id), { force: true });
      state.segments.shift();
      state.terminalReplayStatesBySegmentId.delete(oldest.id);
      state.retainedBytes -= oldest.byteLength;
      continue;
    }

    const segmentPath = getSessionTranscriptSegmentPath(sessionId, oldest.id);
    const contents = await fsp.readFile(segmentPath);
    const retained = takeSessionTranscriptUtf8Tail(contents, oldest.byteLength - excessBytes);
    await fsp.writeFile(segmentPath, retained, { mode: 0o600 });
    if (state.terminalReplayMetadataComplete) {
      const initialParserState = state.terminalReplayStatesBySegmentId.get(oldest.id);
      if (initialParserState === undefined) {
        state.terminalReplayMetadataComplete = false;
      } else {
        const discardedByteLength = contents.length - retained.length;
        state.terminalReplayStatesBySegmentId.set(
          oldest.id,
          resolveSessionTranscriptTerminalReplayParserState(
            contents.subarray(0, discardedByteLength).toString('utf8'),
            initialParserState
          )
        );
      }
    }
    oldest.byteLength = retained.length;
    state.retainedBytes -= contents.length - retained.length;
  }
}

async function createSessionTranscriptStateFromLegacy(sessionId) {
  const normalizedSessionId = normalizeSessionTranscriptId(sessionId);
  const state = createEmptySessionTranscriptState();
  await fsp.mkdir(getSessionTranscriptSegmentsDirectory(normalizedSessionId), {
    recursive: true,
    mode: 0o700,
  });

  let handle;
  try {
    handle = await fsp.open(getLegacySessionTranscriptPath(normalizedSessionId), 'r');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return state;
    }
    throw error;
  }

  try {
    const info = await handle.stat();
    const byteLength = Math.min(info.size, SESSION_TRANSCRIPT_MAX_BYTES);
    const buffer = Buffer.alloc(byteLength);
    const { bytesRead } = await handle.read(buffer, 0, byteLength, info.size - byteLength);
    const retainedLegacyOutput = takeSessionTranscriptUtf8Tail(
      buffer.subarray(0, bytesRead),
      SESSION_TRANSCRIPT_MAX_BYTES
    );
    if (retainedLegacyOutput.length < info.size) {
      state.terminalReplayMetadataComplete = false;
    }
    await writeSessionTranscriptBuffer(normalizedSessionId, state, retainedLegacyOutput);
    state.dirty = true;
    return state;
  } finally {
    await handle.close();
  }
}

async function ensureSessionTranscriptOpen(sessionId) {
  const normalizedSessionId = normalizeSessionTranscriptId(sessionId);
  if (sessionTranscriptOpenedIds.has(normalizedSessionId)) {
    return;
  }

  await fsp.mkdir(getSessionTranscriptDirectory(), { recursive: true, mode: 0o700 });
  let state = await loadSessionTranscriptV2State(normalizedSessionId);
  if (!state) {
    state = await createSessionTranscriptStateFromLegacy(normalizedSessionId);
  }
  if (sessionTranscriptIncompleteTerminalReplayMetadataIds.delete(normalizedSessionId)) {
    state.terminalReplayMetadataComplete = false;
  }

  sessionTranscriptStates.set(normalizedSessionId, state);
  await writeSessionTranscriptManifest(normalizedSessionId, state);
  state.dirty = false;
  sessionTranscriptOpenedIds.add(normalizedSessionId);
}

async function openSessionTranscript(session) {
  if (!isSessionTranscriptAgent(session)) {
    return true;
  }

  const sessionId = normalizeSessionTranscriptId(session.sessionId);
  try {
    await enqueueSessionTranscriptOperation(sessionId, () => ensureSessionTranscriptOpen(sessionId));
    return true;
  } catch (error) {
    recordSessionTranscriptFailure(sessionId, error);
    return false;
  }
}

function getPendingSessionTranscriptAppend(sessionId) {
  const existing = sessionTranscriptPendingAppends.get(sessionId);
  if (existing) {
    return existing;
  }

  const created = {
    chunks: [],
    byteLength: 0,
    latestSequence: 0,
    completedSequence: 0,
    inFlightByteLength: 0,
    inFlight: null,
    timer: null,
  };
  sessionTranscriptPendingAppends.set(sessionId, created);
  return created;
}

function compactPendingSessionTranscriptAppend(sessionId, pending) {
  if (pending.byteLength <= SESSION_TRANSCRIPT_PENDING_APPEND_BYTES) {
    return;
  }

  markSessionTranscriptTerminalReplayMetadataIncomplete(sessionId);
  const retained = takeSessionTranscriptUtf8Tail(
    Buffer.concat(pending.chunks, pending.byteLength),
    SESSION_TRANSCRIPT_PENDING_APPEND_BYTES
  );
  pending.chunks = retained.length > 0 ? [retained] : [];
  pending.byteLength = retained.length;
}

function schedulePendingSessionTranscriptAppendDrain(sessionId, pending) {
  if (pending.timer || pending.byteLength === 0) {
    return;
  }

  pending.timer = setTimeout(() => {
    pending.timer = null;
    drainPendingSessionTranscriptAppend(sessionId, pending);
  }, SESSION_TRANSCRIPT_APPEND_DELAY_MS);
}

function completePendingSessionTranscriptAppendDrain(sessionId, pending) {
  if (pending.byteLength === 0) {
    sessionTranscriptPendingAppends.delete(sessionId);
    return;
  }
  if (pending.byteLength >= SESSION_TRANSCRIPT_PENDING_APPEND_BYTES) {
    drainPendingSessionTranscriptAppend(sessionId, pending);
    return;
  }
  schedulePendingSessionTranscriptAppendDrain(sessionId, pending);
}

function drainPendingSessionTranscriptAppend(sessionId, pending) {
  if (pending.inFlight || pending.byteLength === 0) {
    return;
  }

  if (pending.timer) {
    clearTimeout(pending.timer);
    pending.timer = null;
  }

  const chunks = pending.chunks;
  const byteLength = pending.byteLength;
  const sequence = pending.latestSequence;
  pending.chunks = [];
  pending.byteLength = 0;
  pending.inFlightByteLength = byteLength;

  const operation = enqueueSessionTranscriptOperation(sessionId, async () => {
    await ensureSessionTranscriptOpen(sessionId);
    const state = sessionTranscriptStates.get(sessionId);
    if (!state) {
      throw new Error('Session transcript state is not open: ' + sessionId);
    }

    const incoming = takeSessionTranscriptUtf8Tail(
      Buffer.concat(chunks, byteLength),
      SESSION_TRANSCRIPT_MAX_BYTES
    );
    if (incoming.length === 0) {
      return;
    }

    await writeSessionTranscriptBuffer(sessionId, state, incoming);
    await trimSessionTranscriptToCapacity(sessionId, state);
    state.dirty = true;
  });
  pending.inFlight = operation;
  void operation.then(
    () => {
      if (sessionTranscriptPendingAppends.get(sessionId) !== pending) {
        return;
      }
      pending.completedSequence = sequence;
      pending.inFlight = null;
      pending.inFlightByteLength = 0;
      completePendingSessionTranscriptAppendDrain(sessionId, pending);
    },
    () => {
      if (sessionTranscriptPendingAppends.get(sessionId) !== pending) {
        return;
      }
      pending.inFlight = null;
      pending.inFlightByteLength = 0;
      completePendingSessionTranscriptAppendDrain(sessionId, pending);
    }
  );
}

function queueSessionTranscriptAppend(sessionId, chunk) {
  const encoded = Buffer.from(chunk, 'utf8');
  if (encoded.length > SESSION_TRANSCRIPT_MAX_BYTES) {
    markSessionTranscriptTerminalReplayMetadataIncomplete(sessionId);
  }
  const incoming = takeSessionTranscriptUtf8Tail(encoded, SESSION_TRANSCRIPT_MAX_BYTES);
  if (incoming.length === 0) {
    return;
  }

  const pending = getPendingSessionTranscriptAppend(sessionId);
  pending.chunks.push(incoming);
  pending.byteLength += incoming.length;
  pending.latestSequence += 1;
  compactPendingSessionTranscriptAppend(sessionId, pending);

  if (pending.inFlight) {
    return;
  }
  if (pending.byteLength >= SESSION_TRANSCRIPT_PENDING_APPEND_BYTES) {
    drainPendingSessionTranscriptAppend(sessionId, pending);
    return;
  }
  schedulePendingSessionTranscriptAppendDrain(sessionId, pending);
}

async function flushPendingSessionTranscriptAppend(sessionId) {
  const pending = sessionTranscriptPendingAppends.get(sessionId);
  if (!pending) {
    return;
  }

  const targetSequence = pending.latestSequence;
  while (pending.completedSequence < targetSequence) {
    drainPendingSessionTranscriptAppend(sessionId, pending);
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

function discardPendingSessionTranscriptAppend(sessionId) {
  const pending = sessionTranscriptPendingAppends.get(sessionId);
  if (!pending) {
    return;
  }
  if (pending.timer) {
    clearTimeout(pending.timer);
  }
  sessionTranscriptPendingAppends.delete(sessionId);
}

function markSessionTranscriptTerminalReplayMetadataIncomplete(sessionId) {
  const state = sessionTranscriptStates.get(sessionId);
  if (state) {
    state.terminalReplayMetadataComplete = false;
    return;
  }
  sessionTranscriptIncompleteTerminalReplayMetadataIds.add(sessionId);
}

function appendSessionTranscript(session, chunk) {
  if (!isSessionTranscriptAgent(session) || !chunk) {
    return;
  }

  let sessionId;
  try {
    sessionId = normalizeSessionTranscriptId(session.sessionId);
    queueSessionTranscriptAppend(sessionId, chunk);
  } catch (error) {
    recordSessionTranscriptFailure(session && session.sessionId ? session.sessionId : 'unknown', error);
  }
}

async function flushSessionTranscriptById(sessionId) {
  const normalizedSessionId = normalizeSessionTranscriptId(sessionId);
  await flushPendingSessionTranscriptAppend(normalizedSessionId);
  const pending = sessionTranscriptQueues.get(normalizedSessionId);
  if (pending) {
    await pending.catch(() => undefined);
  }

  await enqueueSessionTranscriptOperation(normalizedSessionId, async () => {
    const state = sessionTranscriptStates.get(normalizedSessionId);
    if (state && state.dirty) {
      await writeSessionTranscriptManifest(normalizedSessionId, state);
      state.dirty = false;
    }
  });
  return !sessionTranscriptFailures.has(normalizedSessionId);
}

async function flushSessionTranscript(session) {
  if (!isSessionTranscriptAgent(session)) {
    return true;
  }
  return flushSessionTranscriptById(session.sessionId);
}

function normalizeSessionTranscriptPageSize(maxBytes) {
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0 ||
    maxBytes > SESSION_TRANSCRIPT_MAX_PAGE_BYTES
  ) {
    throw new RangeError('Invalid session transcript page size: ' + maxBytes);
  }
  return maxBytes;
}

function normalizeSessionTranscriptCursor(beforeByteOffset, size) {
  if (beforeByteOffset === undefined) {
    return size;
  }
  if (
    !Number.isSafeInteger(beforeByteOffset) ||
    beforeByteOffset < 0 ||
    beforeByteOffset > size
  ) {
    throw new RangeError('Invalid session transcript cursor: ' + beforeByteOffset);
  }
  return beforeByteOffset;
}

async function resolveSessionTranscriptV2TerminalReplayParserState(
  sessionId,
  state,
  byteOffset
) {
  if (!state.terminalReplayMetadataComplete) {
    return undefined;
  }
  if (byteOffset === state.retainedBytes) {
    return state.terminalReplayStateAtEnd;
  }

  let segmentStartByteOffset = 0;

  for (const segment of state.segments) {
    const segmentEndByteOffset = segmentStartByteOffset + segment.byteLength;
    if (byteOffset < segmentEndByteOffset) {
      const initialParserState = state.terminalReplayStatesBySegmentId.get(segment.id);
      if (initialParserState === undefined) {
        return undefined;
      }

      const contents = await fsp.readFile(getSessionTranscriptSegmentPath(sessionId, segment.id));
      return resolveSessionTranscriptTerminalReplayParserState(
        contents.subarray(0, byteOffset - segmentStartByteOffset).toString('utf8'),
        initialParserState
      );
    }
    segmentStartByteOffset = segmentEndByteOffset;
  }

  return undefined;
}

async function readSessionTranscriptV2Page(
  sessionId,
  state,
  beforeByteOffset,
  maxBytes,
  terminalReplay
) {
  const endByteOffset = normalizeSessionTranscriptCursor(beforeByteOffset, state.retainedBytes);
  const requestedStartByteOffset = Math.max(0, endByteOffset - maxBytes);
  const chunks = [];
  let segmentStartByteOffset = 0;

  for (const segment of state.segments) {
    const segmentEndByteOffset = segmentStartByteOffset + segment.byteLength;
    const startInSegment = Math.max(0, requestedStartByteOffset - segmentStartByteOffset);
    const endInSegment = Math.min(segment.byteLength, endByteOffset - segmentStartByteOffset);
    if (endInSegment > startInSegment) {
      const contents = await fsp.readFile(getSessionTranscriptSegmentPath(sessionId, segment.id));
      chunks.push(contents.subarray(startInSegment, endInSegment));
    }
    if (segmentEndByteOffset >= endByteOffset) {
      break;
    }
    segmentStartByteOffset = segmentEndByteOffset;
  }

  const pageBuffer = Buffer.concat(chunks);
  const safeStartOffset = findSessionTranscriptUtf8Start(pageBuffer);
  const safeEndOffset = findSessionTranscriptUtf8End(pageBuffer, safeStartOffset);
  const startByteOffset = requestedStartByteOffset + safeStartOffset;
  const initialParserState = terminalReplay
    ? await resolveSessionTranscriptV2TerminalReplayParserState(
        sessionId,
        state,
        startByteOffset
      )
    : undefined;
  return {
    text: pageBuffer.subarray(safeStartOffset, safeEndOffset).toString('utf8'),
    startByteOffset,
    endByteOffset: requestedStartByteOffset + safeEndOffset,
    hasMore: startByteOffset > 0,
    totalBytes: state.retainedBytes,
    health: sessionTranscriptFailures.has(sessionId) ? 'degraded' : 'complete',
    ...(initialParserState === undefined ? {} : { initialParserState }),
  };
}

async function readLegacySessionTranscriptPage(sessionId, beforeByteOffset, maxBytes) {
  let handle;
  try {
    handle = await fsp.open(getLegacySessionTranscriptPath(sessionId), 'r');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return {
        text: '',
        startByteOffset: 0,
        endByteOffset: 0,
        hasMore: false,
        totalBytes: 0,
        health: sessionTranscriptFailures.has(sessionId) ? 'degraded' : 'unavailable',
      };
    }
    throw error;
  }

  try {
    const info = await handle.stat();
    const endByteOffset = normalizeSessionTranscriptCursor(beforeByteOffset, info.size);
    const requestedStartByteOffset = Math.max(0, endByteOffset - maxBytes);
    const buffer = Buffer.alloc(endByteOffset - requestedStartByteOffset);
    const readResult = await handle.read(buffer, 0, buffer.length, requestedStartByteOffset);
    const pageBuffer = buffer.subarray(0, readResult.bytesRead);
    const safeStartOffset = findSessionTranscriptUtf8Start(pageBuffer);
    const safeEndOffset = findSessionTranscriptUtf8End(pageBuffer, safeStartOffset);
    const startByteOffset = requestedStartByteOffset + safeStartOffset;
    return {
      text: pageBuffer.subarray(safeStartOffset, safeEndOffset).toString('utf8'),
      startByteOffset,
      endByteOffset: requestedStartByteOffset + safeEndOffset,
      hasMore: startByteOffset > 0,
      totalBytes: info.size,
      health: sessionTranscriptFailures.has(sessionId) ? 'degraded' : 'complete',
    };
  } finally {
    await handle.close();
  }
}

async function readSessionTranscriptPage(params = {}) {
  const sessionId = normalizeSessionTranscriptId(params.sessionId);
  const maxBytes = normalizeSessionTranscriptPageSize(params.maxBytes);
  if (params.terminalReplay !== true) {
    await flushSessionTranscriptById(sessionId);
  }

  const state = await loadSessionTranscriptV2State(sessionId);
  if (state) {
    return readSessionTranscriptV2Page(
      sessionId,
      state,
      params.beforeByteOffset,
      maxBytes,
      params.terminalReplay === true
    );
  }
  return readLegacySessionTranscriptPage(
    sessionId,
    params.beforeByteOffset,
    maxBytes
  );
}

async function deleteSessionTranscript(params = {}) {
  const sessionId = normalizeSessionTranscriptId(params.sessionId);
  discardPendingSessionTranscriptAppend(sessionId);
  const deletion = enqueueSessionTranscriptOperation(sessionId, async () => {
    await Promise.all([
      fsp.rm(getLegacySessionTranscriptPath(sessionId), { force: true }),
      fsp.rm(getSessionTranscriptV2Directory(sessionId), { force: true, recursive: true }),
    ]);
    sessionTranscriptOpenedIds.delete(sessionId);
    sessionTranscriptStates.delete(sessionId);
    sessionTranscriptIncompleteTerminalReplayMetadataIds.delete(sessionId);
  });
  await deletion;
  if (sessionTranscriptQueues.get(sessionId) === deletion) {
    sessionTranscriptQueues.delete(sessionId);
    sessionTranscriptFailures.delete(sessionId);
  }
  return { success: true };
}
`;
}
