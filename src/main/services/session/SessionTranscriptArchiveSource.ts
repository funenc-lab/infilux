export function getSessionTranscriptArchiveRuntimeSource(): string {
  return `
const SESSION_TRANSCRIPT_ARCHIVE_DIRNAME = 'session-transcripts';
const SESSION_TRANSCRIPT_FILENAME_SUFFIX = '.log';
const SESSION_TRANSCRIPT_MAX_PAGE_BYTES = 256 * 1024;
const SESSION_TRANSCRIPT_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/;
const sessionTranscriptQueues = new Map();
const sessionTranscriptOpenedIds = new Set();
const sessionTranscriptFailures = new Map();

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

function getSessionTranscriptPath(sessionId) {
  return path.join(
    getSessionTranscriptDirectory(),
    normalizeSessionTranscriptId(sessionId) + SESSION_TRANSCRIPT_FILENAME_SUFFIX
  );
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

async function ensureSessionTranscriptOpen(sessionId) {
  const normalizedSessionId = normalizeSessionTranscriptId(sessionId);
  if (sessionTranscriptOpenedIds.has(normalizedSessionId)) {
    return;
  }

  const directory = getSessionTranscriptDirectory();
  const filePath = getSessionTranscriptPath(normalizedSessionId);
  await fsp.mkdir(directory, { recursive: true, mode: 0o700 });
  await fsp.writeFile(filePath, '', { encoding: 'utf8', flag: 'a', mode: 0o600 });
  await fsp.chmod(filePath, 0o600);
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

function appendSessionTranscript(session, chunk) {
  if (!isSessionTranscriptAgent(session) || !chunk) {
    return;
  }

  let sessionId;
  try {
    sessionId = normalizeSessionTranscriptId(session.sessionId);
    void enqueueSessionTranscriptOperation(sessionId, async () => {
      await ensureSessionTranscriptOpen(sessionId);
      await fsp.appendFile(getSessionTranscriptPath(sessionId), chunk, 'utf8');
    });
  } catch (error) {
    recordSessionTranscriptFailure(session && session.sessionId ? session.sessionId : 'unknown', error);
  }
}

async function flushSessionTranscriptById(sessionId) {
  const normalizedSessionId = normalizeSessionTranscriptId(sessionId);
  const pending = sessionTranscriptQueues.get(normalizedSessionId);
  if (pending) {
    await pending.catch(() => undefined);
  }
  return !sessionTranscriptFailures.has(normalizedSessionId);
}

async function flushSessionTranscript(session) {
  if (!isSessionTranscriptAgent(session)) {
    return true;
  }
  return flushSessionTranscriptById(session.sessionId);
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

async function readSessionTranscriptPage(params = {}) {
  const sessionId = normalizeSessionTranscriptId(params.sessionId);
  const maxBytes = normalizeSessionTranscriptPageSize(params.maxBytes);
  await flushSessionTranscriptById(sessionId);

  let handle;
  try {
    handle = await fsp.open(getSessionTranscriptPath(sessionId), 'r');
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
    const endByteOffset = normalizeSessionTranscriptCursor(params.beforeByteOffset, info.size);
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

async function deleteSessionTranscript(params = {}) {
  const sessionId = normalizeSessionTranscriptId(params.sessionId);
  const deletion = enqueueSessionTranscriptOperation(sessionId, async () => {
    await fsp.rm(getSessionTranscriptPath(sessionId), { force: true });
    sessionTranscriptOpenedIds.delete(sessionId);
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
