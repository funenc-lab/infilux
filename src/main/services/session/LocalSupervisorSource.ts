import {
  AGENT_SESSION_REPLAY_CHAR_LIMIT,
  TERMINAL_SESSION_REPLAY_CHAR_LIMIT,
} from '@shared/utils/agentTerminalHistoryPolicy';
import { getSessionTranscriptArchiveRuntimeSource } from './SessionTranscriptArchiveSource';

export const LOCAL_SUPERVISOR_RUNTIME_VERSION = '0.1.1';

export function getLocalSupervisorSource(): string {
  return String.raw`#!/usr/bin/env node
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const LOCAL_SUPERVISOR_RUNTIME_VERSION = ${JSON.stringify(LOCAL_SUPERVISOR_RUNTIME_VERSION)};
const DAEMON_INFO_FILENAME = 'local-supervisor-daemon.json';
	const TERMINAL_SESSION_REPLAY_CHAR_LIMIT = ${TERMINAL_SESSION_REPLAY_CHAR_LIMIT};
	const AGENT_SESSION_REPLAY_CHAR_LIMIT = ${AGENT_SESSION_REPLAY_CHAR_LIMIT};
	const AUTH_TOKEN_BYTES = 36;
		const SESSION_OUTPUT_BATCH_DELAY_MS = 16;
		const SESSION_OUTPUT_BATCH_MAX_CHARS = 64 * 1024;
		const SESSION_OUTPUT_CLIENT_QUEUE_MAX_CHARS = 512 * 1024;
		const SESSION_OUTPUT_PENDING_CHAR_LIMIT = 512 * 1024;
		const JSON_LINE_MAX_CHARS = 32 * 1024 * 1024;

let cachedNodePty = undefined;
let cachedNodePtyError = null;
let fatalExitHandled = false;

const state = {
  sessions: new Map(),
  clients: new Set(),
};
const sessionOutputQueues = new Map();
const clientWriteStates = new Map();

function formatError(error) {
  if (error instanceof Error) {
    return error.stack || error.message;
  }
  return String(error);
}

function exitWithFatalError(error) {
  if (fatalExitHandled) {
    return;
  }
  fatalExitHandled = true;
  const text = formatError(error).trim();
  if (text) {
    process.stderr.write(text.endsWith('\n') ? text : text + '\n');
  }
  process.exit(1);
}

process.on('uncaughtException', (error) => {
  exitWithFatalError(error);
});

process.on('unhandledRejection', (error) => {
  exitWithFatalError(error);
});

function sendMessage(stream, message) {
  if (!stream.writable || stream.destroyed) {
    return;
  }

  const line = JSON.stringify(message) + '\n';
  const state = clientWriteStates.get(stream);
  if (state) {
    state.lines.push(line);
    state.queuedChars += line.length;
    if (state.queuedChars > SESSION_OUTPUT_CLIENT_QUEUE_MAX_CHARS) {
      stream.destroy();
    }
    return;
  }

  if (!stream.write(line)) {
    const writeState = {
      lines: [],
      queuedChars: 0,
    };
    clientWriteStates.set(stream, writeState);
    stream.once('drain', () => flushClientWrites(stream, writeState));
  }
}

function flushClientWrites(stream, writeState) {
  if (clientWriteStates.get(stream) !== writeState || stream.destroyed || !stream.writable) {
    clientWriteStates.delete(stream);
    return;
  }

  while (writeState.lines.length > 0) {
    const line = writeState.lines.shift();
    writeState.queuedChars -= line.length;
    if (!stream.write(line)) {
      stream.once('drain', () => flushClientWrites(stream, writeState));
      return;
    }
  }

  clientWriteStates.delete(stream);
}

function reply(stream, id, result) {
  sendMessage(stream, {
    type: 'response',
    id,
    result,
  });
}

function replyError(stream, id, error) {
  sendMessage(stream, {
    type: 'response',
    id,
    error: error instanceof Error ? error.message : String(error),
  });
}

function broadcast(event, payload) {
  for (const client of state.clients) {
    if (client.destroyed) {
      continue;
    }
    sendMessage(client, {
      type: 'event',
      event,
      payload,
    });
  }
}

function getSessionReplayCharLimit(session) {
  return session && session.kind === 'agent'
    ? AGENT_SESSION_REPLAY_CHAR_LIMIT
    : TERMINAL_SESSION_REPLAY_CHAR_LIMIT;
}

function isHighSurrogate(codeUnit) {
  return codeUnit >= 0xd800 && codeUnit <= 0xdbff;
}

function isLowSurrogate(codeUnit) {
  return codeUnit >= 0xdc00 && codeUnit <= 0xdfff;
}

function takeUtf16Tail(value, maxCodeUnits) {
  if (!value || maxCodeUnits <= 0 || Number.isNaN(maxCodeUnits)) {
    return '';
  }
  if (maxCodeUnits === Number.POSITIVE_INFINITY || value.length <= maxCodeUnits) {
    return value;
  }
  const limit = Math.floor(maxCodeUnits);
  if (limit <= 0) {
    return '';
  }
  let start = value.length - limit;
  if (
    start > 0 &&
    isLowSurrogate(value.charCodeAt(start)) &&
    isHighSurrogate(value.charCodeAt(start - 1))
  ) {
    start += 1;
  }
  return value.slice(start);
}

function isTerminalReplayStringIntroducer(codeUnit) {
  return codeUnit === 0x90 || codeUnit === 0x98 || codeUnit === 0x9e || codeUnit === 0x9f;
}

function isTerminalReplayControlCancellation(codeUnit) {
  return codeUnit === 0x18 || codeUnit === 0x1a;
}

function isTerminalReplayEscapeIntermediate(codeUnit) {
  return codeUnit >= 0x20 && codeUnit <= 0x2f;
}

function advanceTerminalReplayParserState(state, codeUnit) {
  if (state === 'text') {
    if (codeUnit === 0x1b) return 'escape';
    if (codeUnit === 0x9b) return 'csi';
    if (codeUnit === 0x9d) return 'osc';
    return isTerminalReplayStringIntroducer(codeUnit) ? 'string' : 'text';
  }

  if (state === 'escape') {
    if (isTerminalReplayControlCancellation(codeUnit)) return 'text';
    if (codeUnit === 0x1b) return 'escape';
    if (codeUnit === 0x5b) return 'csi';
    if (codeUnit === 0x5d) return 'osc';
    if (codeUnit === 0x50 || codeUnit === 0x58 || codeUnit === 0x5e || codeUnit === 0x5f) {
      return 'string';
    }
    if (codeUnit === 0x9b) return 'csi';
    if (codeUnit === 0x9d) return 'osc';
    if (isTerminalReplayStringIntroducer(codeUnit)) return 'string';
    if (isTerminalReplayEscapeIntermediate(codeUnit)) return 'escapeIntermediate';
    return 'text';
  }

  if (state === 'escapeIntermediate') {
    if (isTerminalReplayControlCancellation(codeUnit)) return 'text';
    if (codeUnit === 0x1b) return 'escape';
    if (isTerminalReplayEscapeIntermediate(codeUnit)) return 'escapeIntermediate';
    if (codeUnit === 0x9b) return 'csi';
    if (codeUnit === 0x9d) return 'osc';
    return isTerminalReplayStringIntroducer(codeUnit) ? 'string' : 'text';
  }

  if (state === 'csi') {
    if (isTerminalReplayControlCancellation(codeUnit)) return 'text';
    if (codeUnit === 0x1b) return 'escape';
    if (codeUnit >= 0x40 && codeUnit <= 0x7e) return 'text';
    if (codeUnit === 0x9b) return 'csi';
    if (codeUnit === 0x9d) return 'osc';
    return isTerminalReplayStringIntroducer(codeUnit) ? 'string' : 'csi';
  }

  if (state === 'osc') {
    if (isTerminalReplayControlCancellation(codeUnit)) return 'text';
    if (codeUnit === 0x07 || codeUnit === 0x9c) return 'text';
    return codeUnit === 0x1b ? 'oscEscape' : 'osc';
  }

  if (state === 'string') {
    if (isTerminalReplayControlCancellation(codeUnit)) return 'text';
    if (codeUnit === 0x9c) return 'text';
    return codeUnit === 0x1b ? 'stringEscape' : 'string';
  }

  if (state === 'oscEscape') {
    if (isTerminalReplayControlCancellation(codeUnit)) return 'text';
    if (codeUnit === 0x5c || codeUnit === 0x07 || codeUnit === 0x9c) return 'text';
    return codeUnit === 0x1b ? 'oscEscape' : 'osc';
  }

  if (isTerminalReplayControlCancellation(codeUnit)) return 'text';
  if (codeUnit === 0x5c || codeUnit === 0x9c) return 'text';
  return codeUnit === 0x1b ? 'stringEscape' : 'string';
}

function resolveTerminalReplayParserState(value, initialState = 'text') {
  let state = initialState;
  for (let index = 0; index < value.length; index += 1) {
    state = advanceTerminalReplayParserState(state, value.charCodeAt(index));
  }
  return state;
}

function takeTerminalReplayTail(value, maxCodeUnits, initialState = 'text') {
  const utf16SafeTail = takeUtf16Tail(value, maxCodeUnits);
  if (!utf16SafeTail || (utf16SafeTail.length === value.length && initialState === 'text')) {
    return utf16SafeTail;
  }

  const requestedStart = value.length - utf16SafeTail.length;
  let safeStart = requestedStart;
  let state = initialState;
  for (let index = 0; index < requestedStart; index += 1) {
    state = advanceTerminalReplayParserState(state, value.charCodeAt(index));
  }
  while (state !== 'text' && safeStart < value.length) {
    state = advanceTerminalReplayParserState(state, value.charCodeAt(safeStart));
    safeStart += 1;
  }
  return value.slice(safeStart);
}

function takeUtf16Prefix(value, maxCodeUnits) {
  if (!value || maxCodeUnits <= 0 || Number.isNaN(maxCodeUnits)) {
    return '';
  }
  if (value.length <= maxCodeUnits || maxCodeUnits === Number.POSITIVE_INFINITY) {
    return value;
  }
  let end = Math.floor(maxCodeUnits);
  if (
    end > 0 &&
    isHighSurrogate(value.charCodeAt(end - 1)) &&
    isLowSurrogate(value.charCodeAt(end))
  ) {
    end -= 1;
  }
  return value.slice(0, Math.max(1, end));
}

function appendReplayTail(session, chunk) {
  if (!chunk) {
    return session.replay;
  }
  const limit = getSessionReplayCharLimit(session);
  const combined = session.replay + chunk;
  const initialState = session.replay ? 'text' : session.replayParserState || 'text';
  const replay = takeTerminalReplayTail(combined, limit, initialState);
  session.replayParserState = replay
    ? 'text'
    : resolveTerminalReplayParserState(combined, initialState);
  return replay;
}

function takeQueuedSessionOutput(queue, maxChars) {
  const chunks = [];
  let remainingChars = maxChars;
  while (queue.chunks.length > 0 && remainingChars > 0) {
    const current = queue.chunks[0];
    const next = takeUtf16Prefix(current, remainingChars);
    if (!next) {
      break;
    }
    chunks.push(next);
    queue.queuedChars -= next.length;
    remainingChars -= next.length;
    if (next.length === current.length) {
      queue.chunks.shift();
    } else {
      queue.chunks[0] = current.slice(next.length);
    }
  }
  return chunks.join('');
}

function requestSessionOutputResync(session) {
  const queue = sessionOutputQueues.get(session.sessionId);
  if (queue) {
    clearTimeout(queue.timer);
    sessionOutputQueues.delete(session.sessionId);
  }
  broadcast('session:output-resync', {
    sessionId: session.sessionId,
    replay: session.replay,
  });
}

function queueSessionOutput(session, data) {
  if (!session || !data) {
    return;
  }

  let queue = sessionOutputQueues.get(session.sessionId);
  if (!queue) {
    const sessionId = session.sessionId;
    queue = {
      session,
      chunks: [],
      queuedChars: 0,
      timer: setTimeout(() => flushSessionOutput(sessionId), SESSION_OUTPUT_BATCH_DELAY_MS),
    };
    sessionOutputQueues.set(sessionId, queue);
  }

  let remaining = data;
  while (remaining) {
    const availableChars = SESSION_OUTPUT_PENDING_CHAR_LIMIT - queue.queuedChars;
    if (availableChars <= 0) {
      requestSessionOutputResync(session);
      return;
    }
    const next = takeUtf16Prefix(remaining, availableChars);
    if (!next || queue.queuedChars + next.length > SESSION_OUTPUT_PENDING_CHAR_LIMIT) {
      requestSessionOutputResync(session);
      return;
    }
    queue.chunks.push(next);
    queue.queuedChars += next.length;
    remaining = remaining.slice(next.length);
  }
}

function flushSessionOutput(sessionId, drainAll = false) {
  let queue = sessionOutputQueues.get(sessionId);
  while (queue) {
    clearTimeout(queue.timer);
    const data = takeQueuedSessionOutput(queue, SESSION_OUTPUT_BATCH_MAX_CHARS);
    if (queue.queuedChars > 0) {
      if (!drainAll) {
        queue.timer = setTimeout(() => flushSessionOutput(sessionId), SESSION_OUTPUT_BATCH_DELAY_MS);
      }
    } else {
      sessionOutputQueues.delete(sessionId);
    }

    if (data) {
      broadcast('session:data', {
        sessionId,
        data,
      });
    }

    if (!drainAll || queue.queuedChars === 0) {
      return;
    }
    queue = sessionOutputQueues.get(sessionId);
  }
}

function loadNodePty() {
  if (cachedNodePty !== undefined) {
    return cachedNodePty;
  }

  try {
    cachedNodePty = require('node-pty');
    cachedNodePtyError = null;
  } catch (error) {
    cachedNodePty = null;
    cachedNodePtyError = error instanceof Error ? error.message : String(error);
  }
  return cachedNodePty;
}

function getDaemonDirectory() {
  return path.dirname(__filename);
}

function getSessionTranscriptRootDirectory() {
  return getDaemonDirectory();
}

${getSessionTranscriptArchiveRuntimeSource()}

function getDaemonInfoPath() {
  return path.join(getDaemonDirectory(), DAEMON_INFO_FILENAME);
}

async function readDaemonInfo() {
  try {
    const raw = await fsp.readFile(getDaemonInfoPath(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeDaemonInfo(info) {
  await fsp.mkdir(getDaemonDirectory(), { recursive: true });
  await fsp.writeFile(getDaemonInfoPath(), JSON.stringify(info), {
    encoding: 'utf8',
    mode: 0o600,
  });
  await fsp.chmod(getDaemonInfoPath(), 0o600).catch(() => {});
}

async function removeDaemonInfo() {
  await fsp.rm(getDaemonInfoPath(), { force: true }).catch(() => {});
}

function createJsonLineDispatcher(stream, onMessage) {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buffer += chunk;
    let lineEnd = buffer.indexOf('\n');
    while (lineEnd >= 0) {
      const line = buffer.slice(0, lineEnd);
      buffer = buffer.slice(lineEnd + 1);
      if (line.length > JSON_LINE_MAX_CHARS) {
        buffer = '';
        stream.destroy();
        return;
      }
      if (!line.trim()) {
        lineEnd = buffer.indexOf('\n');
        continue;
      }
      try {
        onMessage(JSON.parse(line));
      } catch (error) {
        if (stream.writable && !stream.destroyed) {
          sendMessage(stream, {
            type: 'parse-error',
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      lineEnd = buffer.indexOf('\n');
    }
    if (buffer.length > JSON_LINE_MAX_CHARS) {
      buffer = '';
      stream.destroy();
    }
  });
}

function defaultShell() {
  if (process.platform === 'win32') {
    return process.env.ComSpec || 'cmd.exe';
  }
  return process.env.SHELL || '/bin/sh';
}

function normalizeCwd(cwd) {
  if (typeof cwd === 'string' && cwd.trim()) {
    return cwd;
  }
  return os.homedir();
}

function cloneMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }
  return { ...metadata };
}

function buildLaunch(options) {
  const shell = typeof options.shell === 'string' && options.shell.trim() ? options.shell : defaultShell();
  const args = Array.isArray(options.args) ? options.args.filter((value) => typeof value === 'string') : [];
  const initialCommand =
    typeof options.initialCommand === 'string' && options.initialCommand.trim()
      ? options.initialCommand.trim()
      : null;

  if (initialCommand && args.length === 0) {
    if (process.platform === 'win32') {
      return {
        shell: process.env.ComSpec || 'cmd.exe',
        args: ['/d', '/s', '/c', initialCommand],
      };
    }

    return {
      shell,
      args: ['-lc', initialCommand],
    };
  }

  return { shell, args };
}

function createDescriptor(session) {
  return {
    sessionId: session.sessionId,
    backend: 'local',
    kind: session.kind,
    cwd: session.cwd,
    persistOnDisconnect: session.persistOnDisconnect,
    createdAt: session.createdAt,
    metadata: session.metadata,
  };
}

function finalizeSessionExit(session, exitCode, signal) {
  if (!state.sessions.has(session.sessionId)) {
    return;
  }

  state.sessions.delete(session.sessionId);
  const emitExit = () => {
    flushSessionOutput(session.sessionId, true);
    broadcast('session:exit', {
      sessionId: session.sessionId,
      exitCode,
      signal,
    });
  };

  if (!isSessionTranscriptAgent(session)) {
    emitExit();
    return;
  }

  void flushSessionTranscript(session).then(emitExit);
}

function destroySession(session, signal) {
  if (!session || !session.pty) {
    return;
  }
  try {
    session.pty.kill(signal);
  } catch {
    try {
      session.pty.kill();
    } catch {}
  }
}

async function createSession(params = {}) {
  const nodePty = loadNodePty();
  if (!nodePty) {
    throw new Error(cachedNodePtyError || 'node-pty is unavailable');
  }

  const options = params.options && typeof params.options === 'object' ? params.options : {};
  const sessionId =
    typeof params.sessionId === 'string' && params.sessionId
      ? params.sessionId
      : crypto.randomUUID();

  if (state.sessions.has(sessionId)) {
    throw new Error('Session already exists: ' + sessionId);
  }

  const cwd = normalizeCwd(options.cwd);
  const launch = buildLaunch(options);
  const env = {
    ...process.env,
    ...(options.env && typeof options.env === 'object' ? options.env : {}),
  };

  const session = {
    sessionId,
    kind: options.kind === 'agent' ? 'agent' : 'terminal',
    cwd,
    persistOnDisconnect: options.persistOnDisconnect !== false,
    metadata: cloneMetadata(options.metadata),
    createdAt: Date.now(),
    replay: '',
    replayParserState: 'text',
    lastDataAt: 0,
    attachCount: 0,
    pty: null,
  };

  await openSessionTranscript(session);

  const pty = nodePty.spawn(launch.shell, launch.args, {
    name: 'xterm-256color',
    cols: Number.isFinite(options.cols) && options.cols > 0 ? options.cols : 80,
    rows: Number.isFinite(options.rows) && options.rows > 0 ? options.rows : 24,
    cwd,
    env,
    useConpty: process.platform === 'win32',
  });

  pty.onData((data) => {
    appendSessionTranscript(session, data);
    session.lastDataAt = Date.now();
    session.replay = appendReplayTail(session, data);
    queueSessionOutput(session, data);
  });

  pty.onExit(({ exitCode, signal }) => {
    finalizeSessionExit(session, exitCode, signal);
  });

  session.pty = pty;
  state.sessions.set(sessionId, session);

  return {
    session: createDescriptor(session),
  };
}

async function attachSession(params = {}) {
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : '';
  const session = state.sessions.get(sessionId);
  if (!session) {
    throw new Error('Session not found: ' + sessionId);
  }

  session.attachCount += 1;
  return {
    session: createDescriptor(session),
    replay: session.replay,
  };
}

async function getSessionSnapshot(params = {}) {
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : '';
  const session = state.sessions.get(sessionId);
  if (!session) {
    throw new Error('Session not found: ' + sessionId);
  }

  return {
    session: createDescriptor(session),
    replay: session.replay,
  };
}

async function detachSession(params = {}) {
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : '';
  const session = state.sessions.get(sessionId);
  if (!session) {
    return { success: true };
  }

  if (session.attachCount > 0) {
    session.attachCount -= 1;
  }

  if (!session.persistOnDisconnect && session.attachCount === 0) {
    destroySession(session);
  }

  return { success: true };
}

async function killSession(params = {}) {
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : '';
  const session = state.sessions.get(sessionId);
  if (!session) {
    return { success: true };
  }

  destroySession(session);
  return { success: true };
}

async function writeSession(params = {}) {
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : '';
  const session = state.sessions.get(sessionId);
  if (!session) {
    throw new Error('Session not found: ' + sessionId);
  }

  session.pty.write(typeof params.data === 'string' ? params.data : '');
  return { success: true };
}

async function resizeSession(params = {}) {
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : '';
  const session = state.sessions.get(sessionId);
  if (!session) {
    return { success: true };
  }

  const cols = Number.isFinite(params.cols) && params.cols > 0 ? params.cols : 80;
  const rows = Number.isFinite(params.rows) && params.rows > 0 ? params.rows : 24;
  session.pty.resize(cols, rows);
  return { success: true };
}

async function listSessions() {
  return [...state.sessions.values()].map((session) => createDescriptor(session));
}

async function getSessionActivity(params = {}) {
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : '';
  const session = state.sessions.get(sessionId);
  if (!session) {
    return false;
  }
  return Date.now() - session.lastDataAt < 1000;
}

async function hasSession(params = {}) {
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : '';
  return state.sessions.has(sessionId);
}

async function authenticateDaemon(token) {
  const info = await readDaemonInfo();
  if (!info || typeof token !== 'string') {
    return false;
  }

  const provided = Buffer.from(token, 'utf8');
  const expected = Buffer.from(info.token, 'utf8');
  if (provided.length !== AUTH_TOKEN_BYTES || expected.length !== AUTH_TOKEN_BYTES) {
    return false;
  }

  return crypto.timingSafeEqual(provided, expected);
}

async function pingDaemon() {
  return {
    ok: true,
    pid: process.pid,
    runtimeVersion: LOCAL_SUPERVISOR_RUNTIME_VERSION,
    platform: process.platform,
  };
}

const handlers = {
  'daemon:ping': () => pingDaemon(),
  'session:create': (params) => createSession(params),
  'session:attach': (params) => attachSession(params),
  'session:snapshot': (params) => getSessionSnapshot(params),
  'session:detach': (params) => detachSession(params),
  'session:kill': (params) => killSession(params),
  'session:write': (params) => writeSession(params),
  'session:resize': (params) => resizeSession(params),
  'session:list': () => listSessions(),
  'session:getActivity': (params) => getSessionActivity(params),
  'session:has': (params) => hasSession(params),
  'session:transcript:read': (params) => readSessionTranscriptPage(params),
  'session:transcript:delete': (params) => deleteSessionTranscript(params),
};

async function dispatchRequest(stream, message, authState) {
  if (message.method === 'daemon:auth') {
    const ok = await authenticateDaemon(message.params && message.params.token);
    authState.authenticated = ok;
    authState.subscribed = Boolean(message.params && message.params.subscribe);
    if (ok && authState.subscribed) {
      state.clients.add(stream);
    }
    reply(stream, message.id, { ok });
    return;
  }

  if (!authState.authenticated) {
    replyError(stream, message.id, new Error('Not authenticated'));
    return;
  }

  const handler = handlers[message.method];
  if (!handler) {
    replyError(stream, message.id, new Error('Unknown method: ' + message.method));
    return;
  }

  try {
    const result = await handler(message.params);
    reply(stream, message.id, result);
  } catch (error) {
    replyError(stream, message.id, error);
  }
}

async function startDaemon() {
  const token = crypto.randomUUID();
  const server = net.createServer((socket) => {
    const authState = {
      authenticated: false,
      subscribed: false,
    };

    createJsonLineDispatcher(socket, (message) => {
      void dispatchRequest(socket, message, authState);
    });

    socket.on('close', () => {
      clientWriteStates.delete(socket);
      if (authState.subscribed) {
        state.clients.delete(socket);
      }
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Invalid daemon address');
  }

  await writeDaemonInfo({
    host: '127.0.0.1',
    port: address.port,
    pid: process.pid,
    token,
    runtimeVersion: LOCAL_SUPERVISOR_RUNTIME_VERSION,
  });

  const cleanup = async () => {
    for (const session of state.sessions.values()) {
      destroySession(session);
    }
    await Promise.allSettled(
      [...state.sessions.values()].map((session) => flushSessionTranscript(session))
    );
    state.sessions.clear();
    for (const client of state.clients) {
      client.destroy();
    }
    state.clients.clear();
    server.close();
    await removeDaemonInfo();
  };

  process.on('SIGTERM', () => {
    void cleanup().finally(() => process.exit(0));
  });
  process.on('SIGINT', () => {
    void cleanup().finally(() => process.exit(0));
  });
}

async function main() {
  if (process.argv.includes('--daemon')) {
    await startDaemon();
    return;
  }
  throw new Error('Unsupported local supervisor command');
}

void main().catch((error) => {
  exitWithFatalError(error);
});
`;
}
