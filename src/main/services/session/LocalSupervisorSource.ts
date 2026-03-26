export const LOCAL_SUPERVISOR_RUNTIME_VERSION = '0.1.0';

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
const REPLAY_LIMIT_CHARS = 65536;
const AUTH_TOKEN_BYTES = 36;

let cachedNodePty = undefined;
let cachedNodePtyError = null;
let fatalExitHandled = false;

const state = {
  sessions: new Map(),
  clients: new Set(),
};

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
  stream.write(JSON.stringify(message) + '\n');
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

function appendReplayTail(current, chunk) {
  if (!chunk) {
    return current;
  }
  const combined = current + chunk;
  return combined.length > REPLAY_LIMIT_CHARS ? combined.slice(-REPLAY_LIMIT_CHARS) : combined;
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
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) {
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
  broadcast('session:exit', {
    sessionId: session.sessionId,
    exitCode,
    signal,
  });
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
    lastDataAt: 0,
    attachCount: 0,
    pty: null,
  };

  const pty = nodePty.spawn(launch.shell, launch.args, {
    name: 'xterm-256color',
    cols: Number.isFinite(options.cols) && options.cols > 0 ? options.cols : 80,
    rows: Number.isFinite(options.rows) && options.rows > 0 ? options.rows : 24,
    cwd,
    env,
    useConpty: process.platform === 'win32',
  });

  pty.onData((data) => {
    session.lastDataAt = Date.now();
    session.replay = appendReplayTail(session.replay, data);
    broadcast('session:data', {
      sessionId: session.sessionId,
      data,
    });
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
  'session:detach': (params) => detachSession(params),
  'session:kill': (params) => killSession(params),
  'session:write': (params) => writeSession(params),
  'session:resize': (params) => resizeSession(params),
  'session:list': () => listSessions(),
  'session:getActivity': (params) => getSessionActivity(params),
  'session:has': (params) => hasSession(params),
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
