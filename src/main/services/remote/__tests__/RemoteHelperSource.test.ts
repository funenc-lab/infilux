import {
  AGENT_SESSION_REPLAY_CHAR_LIMIT,
  TERMINAL_SESSION_REPLAY_CHAR_LIMIT,
} from '@shared/utils/agentTerminalHistoryPolicy';
import { buildAppRuntimeIdentity } from '@shared/utils/runtimeIdentity';
import { describe, expect, it } from 'vitest';
import pkg from '../../../../../package.json';
import { getRemoteServerSource, REMOTE_SERVER_VERSION } from '../RemoteHelperSource';

type GeneratedSession = {
  sessionId: string;
  kind: 'agent' | 'terminal';
  replay: string;
  lastDataAt: number;
  streamState: 'attaching' | 'buffering' | 'live';
  attachCount: number;
  pendingExit: { exitCode: number; signal?: number } | null;
  writable: null;
};

type GeneratedSessionEvent = {
  event: string;
  payload: { sessionId: string; data?: string; exitCode?: number; signal?: number };
};

type GeneratedSessionFunctions = {
  activateSessionAfterAttach: (sessionId: string, replayLength: number) => void;
  appendReplay: (session: GeneratedSession, chunk: string) => void;
};

type GeneratedSessionFactory = (
  state: { clients: Set<unknown>; sessions: Map<string, GeneratedSession> },
  sessionOutputQueues: Map<string, { data: string; timer: unknown }>,
  broadcast: (event: string, payload: GeneratedSessionEvent['payload']) => void,
  setTimeout: (callback: () => void, delay: number) => unknown,
  clearTimeout: (timer: unknown) => void,
  terminalReplayLimit: number,
  agentReplayLimit: number
) => GeneratedSessionFunctions;

function createGeneratedSessionFunctions(source: string): GeneratedSessionFactory {
  const helperStart = source.indexOf('function isHighSurrogate(code) {');
  const helperEnd = source.indexOf('function resolvePathWithinRoot', helperStart);
  const start = source.indexOf('function getSessionReplayCharLimit(session) {');
  const end = source.indexOf('function pauseAttachedSessions() {');

  expect(helperStart).toBeGreaterThan(-1);
  expect(helperEnd).toBeGreaterThan(helperStart);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);

  const helperSource = source.slice(helperStart, helperEnd);
  const sessionSource = source.slice(start, end);
  const factory = new Function(
    'state',
    'sessionOutputQueues',
    'broadcast',
    'setTimeout',
    'clearTimeout',
    'TERMINAL_SESSION_REPLAY_CHAR_LIMIT',
    'AGENT_SESSION_REPLAY_CHAR_LIMIT',
    `
      const SESSION_OUTPUT_BATCH_DELAY_MS = 16;
      const SESSION_OUTPUT_BATCH_MAX_CHARS = 64 * 1024;
      const isSessionTranscriptAgent = (session) => Boolean(session && session.kind === 'agent');
      const flushSessionTranscript = async () => true;
      ${helperSource}
      ${sessionSource}
      return { activateSessionAfterAttach, appendReplay };
    `
  ) as GeneratedSessionFactory;

  return factory;
}

describe('getRemoteServerSource', () => {
  it('parses the generated remote helper source', () => {
    const source = getRemoteServerSource();

    expect(() => new Function(source.replace(/^#!.*\r?\n/, ''))).not.toThrow();
  });

  it('batches attach delta before a pending exit without splitting surrogate pairs', () => {
    const source = getRemoteServerSource();
    const createSessionFunctions = createGeneratedSessionFunctions(source);
    const sessionId = 'session-1';
    const delta = `${'x'.repeat(64 * 1024 - 1)}😀tail`;
    const session: GeneratedSession = {
      sessionId,
      kind: 'terminal',
      replay: delta,
      lastDataAt: 0,
      streamState: 'attaching',
      attachCount: 1,
      pendingExit: { exitCode: 0 },
      writable: null,
    };
    const state = {
      clients: new Set<unknown>([{}]),
      sessions: new Map<string, GeneratedSession>([[sessionId, session]]),
    };
    const sessionOutputQueues = new Map<string, { data: string; timer: unknown }>();
    const events: GeneratedSessionEvent[] = [];
    const { activateSessionAfterAttach } = createSessionFunctions(
      state,
      sessionOutputQueues,
      (event, payload) => events.push({ event, payload }),
      () => 0,
      () => {},
      TERMINAL_SESSION_REPLAY_CHAR_LIMIT,
      AGENT_SESSION_REPLAY_CHAR_LIMIT
    );

    activateSessionAfterAttach(sessionId, 0);

    const dataEvents = events.filter((event) => event.event === 'session:data');
    const exitEventIndex = events.findIndex((event) => event.event === 'session:exit');

    expect(dataEvents).toHaveLength(2);
    expect(dataEvents.map((event) => event.payload.data).join('')).toBe(delta);
    expect(dataEvents.every((event) => (event.payload.data?.length ?? 0) <= 64 * 1024)).toBe(true);
    expect(
      dataEvents.every((event) => {
        const data = event.payload.data ?? '';
        const firstCode = data.charCodeAt(0);
        const lastCode = data.charCodeAt(data.length - 1);
        return (
          !(firstCode >= 0xdc00 && firstCode <= 0xdfff) &&
          !(lastCode >= 0xd800 && lastCode <= 0xdbff)
        );
      })
    ).toBe(true);
    expect(events.findLastIndex((event) => event.event === 'session:data')).toBeLessThan(
      exitEventIndex
    );
    expect(sessionOutputQueues.size).toBe(0);
  });

  it('batches live remote session output with bounded Unicode-safe payloads', () => {
    const source = getRemoteServerSource();

    expect(source).toContain('const SESSION_OUTPUT_BATCH_DELAY_MS = 16;');
    expect(source).toContain('const SESSION_OUTPUT_BATCH_MAX_CHARS = 64 * 1024;');
    expect(source).toContain('const sessionOutputQueues = new Map();');
    expect(source).toContain('function takeSessionOutputChunk(data, maxLength) {');
    expect(source).toContain('isHighSurrogate(data.charCodeAt(end - 1))');
    expect(source).toContain('isLowSurrogate(data.charCodeAt(end))');
    expect(source).toContain('function enqueueSessionOutput(session, chunk) {');
    expect(source).toContain('function flushSessionOutput(sessionId) {');
    expect(source).toContain('function discardSessionOutput(sessionId) {');
    expect(source).toContain(
      'setTimeout(() => flushSessionOutput(sessionId), SESSION_OUTPUT_BATCH_DELAY_MS)'
    );
    expect(source).toContain('queue.data.length >= SESSION_OUTPUT_BATCH_MAX_CHARS');
    expect(source).toContain(
      'if (!nextChunk) {\n      flushSessionOutput(session.sessionId);\n      continue;\n    }'
    );
    expect(source).toContain('enqueueSessionOutput(session, chunk);');
  });

  it('flushes live output before session exit and discards queues without consumers', () => {
    const source = getRemoteServerSource();
    const exitFlushIndex = source.indexOf('flushSessionOutput(session.sessionId);');
    const exitEventIndex = source.indexOf('emitSessionExit(session, session.pendingExit.exitCode');

    expect(exitFlushIndex).toBeGreaterThan(-1);
    expect(exitEventIndex).toBeGreaterThan(exitFlushIndex);
    expect(source).toContain(
      'discardSessionOutput(sessionId);\n  state.sessions.delete(sessionId);'
    );
    expect(source).toMatch(
      /function pauseAttachedSessions\(\) \{[\s\S]*discardSessionOutput\(session\.sessionId\);/
    );
  });

  it('uses bounded asynchronous reads and secure fingerprints for remote untracked diff stats', () => {
    const source = getRemoteServerSource();

    expect(source).toContain('untrackedDiffStatsCache: new Map()');
    expect(source).toContain('const untrackedFileEntry = await fsp.lstat(absolutePath);');
    expect(source).toContain('untrackedFileEntry.isSymbolicLink()');
    expect(source).toContain('const UNTRACKED_FILE_OPEN_FLAGS =');
    expect(source).toContain('fs.constants.O_NOFOLLOW');
    expect(source).toContain(
      'const handle = await fsp.open(absolutePath, UNTRACKED_FILE_OPEN_FLAGS);'
    );
    expect(source).toContain('const openedFileEntry = await handle.stat();');
    expect(source).toContain('matchesUntrackedFileIdentity(untrackedFileEntry, openedFileEntry)');
    expect(source).toContain('const UNTRACKED_DIFF_READ_CHUNK_SIZE = 256 * 1024;');
    expect(source).toContain("['ctimeMs', 'ino', 'dev', 'mode']");
    expect(source).not.toContain('fsp.readFile(absolutePath)');
  });

  it('keeps the remote server version aligned with the app release version', () => {
    expect(REMOTE_SERVER_VERSION).toBe(pkg.version);
    expect(getRemoteServerSource()).toContain(
      `const REMOTE_SERVER_VERSION = ${JSON.stringify(pkg.version)};`
    );
  });

  it('uses the Infilux runtime namespace for remote helper artifacts and tmux defaults', () => {
    const runtimeIdentity = buildAppRuntimeIdentity('test');
    const source = getRemoteServerSource(runtimeIdentity);

    expect(source).toContain('const DAEMON_INFO_FILE = "infilux-remote-daemon.json";');
    expect(source).toContain(
      'const RUNTIME_MANIFEST_FILENAME = "infilux-remote-runtime-manifest.json";'
    );
    expect(source).toContain(
      `const DEFAULT_TMUX_SERVER_NAME = "${runtimeIdentity.tmuxServerName}";`
    );
    expect(source).toContain(
      `typeof serverName === 'string' && serverName.length > 0 ? serverName : '${runtimeIdentity.tmuxServerName}';`
    );
    expect(source).toContain(
      "'tmux -L ' + shellQuote(normalizedServerName) + ' kill-session -t ' + shellQuote(name)"
    );
    expect(source).not.toContain('const DAEMON_INFO_FILE = "enso-remote-daemon.json";');
    expect(source).not.toContain(
      'const RUNTIME_MANIFEST_FILENAME = "enso-remote-runtime-manifest.json";'
    );
    expect(source).not.toContain("'tmux -L enso kill-session -t ' + shellQuote(name)");
    expect(source).not.toContain(
      "typeof serverName === 'string' && serverName.length > 0 ? serverName : 'enso';"
    );
  });

  it('keeps remote tmux scroll behavior aligned with the cached local pane resolution flow', () => {
    const source = getRemoteServerSource(buildAppRuntimeIdentity('test'));

    expect(source).toContain('const TMUX_SCROLL_PANE_CACHE_TTL_MS = 250;');
    expect(source).toContain('const tmuxScrollPaneCache = new Map();');
    expect(source).toContain('function buildTmuxScrollPaneCacheKey(serverName, sessionName) {');
    expect(source).toContain('function getCachedTmuxScrollPane(serverName, sessionName) {');
    expect(source).toContain('function setCachedTmuxScrollPane(serverName, sessionName, pane) {');
    expect(source).toContain('function clearCachedTmuxScrollPane(serverName, sessionName) {');
    expect(source).toContain(
      'async function resolveTmuxScrollPane(sessionName, serverName, options = {}) {'
    );
    expect(source).toContain('const cached = getCachedTmuxScrollPane(serverName, sessionName);');
    expect(source).toContain("if (direction === 'bottom') {");
    expect(source).toContain(
      'setCachedTmuxScrollPane(normalizedServerName, normalizedSessionName, {'
    );
    expect(source).toContain(
      'clearCachedTmuxScrollPane(normalizedServerName, normalizedSessionName);'
    );
  });

  it('uses the expanded agent replay budget in the generated remote session helper', () => {
    const source = getRemoteServerSource(buildAppRuntimeIdentity('test'));

    expect(source).toContain(
      `const TERMINAL_SESSION_REPLAY_CHAR_LIMIT = ${TERMINAL_SESSION_REPLAY_CHAR_LIMIT};`
    );
    expect(source).toContain(
      `const AGENT_SESSION_REPLAY_CHAR_LIMIT = ${AGENT_SESSION_REPLAY_CHAR_LIMIT};`
    );
    expect(source).toContain('function getSessionReplayCharLimit(session) {');
    expect(source).toContain(
      'session.replay = takeUtf16Tail(session.replay + chunk, getSessionReplayCharLimit(session));'
    );
    expect(source).not.toContain('MAX_SESSION_REPLAY_CHARS');
  });

  it('keeps generated remote replay tails Unicode-safe', () => {
    const createSessionFunctions = createGeneratedSessionFunctions(getRemoteServerSource());
    const session: GeneratedSession = {
      sessionId: 'session-utf16-tail',
      kind: 'terminal',
      replay: '',
      lastDataAt: 0,
      streamState: 'live',
      attachCount: 1,
      pendingExit: null,
      writable: null,
    };
    const { appendReplay } = createSessionFunctions(
      { clients: new Set(), sessions: new Map() },
      new Map(),
      () => {},
      () => 0,
      () => {},
      3,
      3
    );

    appendReplay(session, `A\u{1F680}BC`);

    expect(session.replay).toBe('BC');
  });

  it('archives generated remote agent output before transport batching', () => {
    const source = getRemoteServerSource();

    expect(source).toContain('appendSessionTranscript(session, chunk);');
    expect(source).toContain(
      "'session:transcript:read': ({ sessionId, beforeByteOffset, maxBytes }) =>"
    );
    expect(source).toContain("'session:transcript:delete': ({ sessionId }) =>");
  });

  it('keeps remote search behavior aligned with the shared search contract', () => {
    const source = getRemoteServerSource(buildAppRuntimeIdentity('test'));

    expect(source).toContain(
      'async function searchFiles(rootPath, query, maxResults = 100, includeDirectories = false, useGitignore = true, requestId)'
    );
    expect(source).toContain('activeSearches: new Map()');
    expect(source).toContain('registerActiveSearch(requestId, child)');
    expect(source).toContain('function fuzzyMatch(query, target)');
    expect(source).toContain(
      'return Math.max(fuzzyMatch(query, name), fuzzyMatch(query, relativePath) * 0.8);'
    );
    expect(source).toContain("if (useGitignore) args.push('--exclude-standard');");
    expect(source).toContain("if (!useGitignore) args.push('--no-ignore');");
    expect(source).toContain(
      "const args = ['-n', '--column', '-I', '--hidden', '-m', String(maxResults)];"
    );
    expect(source).toContain('allowedExitCodes: [0, 1, 2]');
    expect(source).toContain(
      "error: code === 2 && matches.length === 0 ? 'Invalid search expression' : undefined"
    );
    expect(source).toContain('const limitedMatches = matches.slice(0, maxResults);');
    expect(source).toContain('truncated: matches.length > limitedMatches.length');
    expect(source).toContain(
      "'search:files': ({ rootPath, query, maxResults, includeDirectories, useGitignore, requestId }) =>"
    );
    expect(source).toContain("'search:cancel': ({ requestId }) => cancelSearch(requestId)");
  });
});
