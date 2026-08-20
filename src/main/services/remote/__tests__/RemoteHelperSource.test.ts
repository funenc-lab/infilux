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
  payload: {
    sessionId: string;
    data?: string;
    replay?: string;
    exitCode?: number;
    signal?: number;
  };
};

type GeneratedSessionFunctions = {
  activateSessionAfterAttach: (sessionId: string, replayLength: number) => void;
  appendReplay: (session: GeneratedSession, chunk: string) => void;
  enqueueSessionOutput: (session: GeneratedSession, chunk: string) => void;
  flushSessionOutput: (sessionId: string, drainAll?: boolean) => void;
};

type GeneratedSessionFactory = (
  state: { clients: Set<unknown>; sessions: Map<string, GeneratedSession> },
  sessionOutputQueues: Map<string, { chunks: string[]; queuedChars: number; timer: unknown }>,
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
      const SESSION_OUTPUT_PENDING_CHAR_LIMIT = 512 * 1024;
      const isSessionTranscriptAgent = (session) => Boolean(session && session.kind === 'agent');
      const flushSessionTranscript = async () => true;
      ${helperSource}
      ${sessionSource}
      return { activateSessionAfterAttach, appendReplay, enqueueSessionOutput, flushSessionOutput };
    `
  ) as GeneratedSessionFactory;

  return factory;
}

function createGeneratedTmuxCacheFunctions(
  source: string,
  tmuxScrollPaneCache: Map<string, unknown>,
  now: () => number
): {
  getCachedTmuxScrollPane: (serverName: string, sessionName: string) => unknown;
  setCachedTmuxScrollPane: (
    serverName: string,
    sessionName: string,
    pane: { paneId: string; inMode: boolean }
  ) => void;
} {
  const start = source.indexOf('function buildTmuxScrollPaneCacheKey(serverName, sessionName) {');
  const end = source.indexOf('async function resolveTmuxScrollPane(', start);

  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);

  return new Function(
    'tmuxScrollPaneCache',
    'Date',
    `
      const TMUX_SCROLL_PANE_CACHE_TTL_MS = 250;
      const TMUX_SCROLL_PANE_CACHE_MAX_ENTRIES = 2;
      ${source.slice(start, end)}
      return { getCachedTmuxScrollPane, setCachedTmuxScrollPane };
    `
  )(tmuxScrollPaneCache, { now }) as {
    getCachedTmuxScrollPane: (serverName: string, sessionName: string) => unknown;
    setCachedTmuxScrollPane: (
      serverName: string,
      sessionName: string,
      pane: { paneId: string; inMode: boolean }
    ) => void;
  };
}

function createGeneratedUntrackedCacheFunctions(
  source: string,
  state: { untrackedDiffStatsCache: Map<string, unknown> },
  now: () => number
): {
  getCachedUntrackedDiffStats: (cacheKey: string) => unknown;
  setCachedUntrackedDiffStats: (cacheKey: string, value: unknown) => void;
} {
  const start = source.indexOf('function pruneUntrackedDiffStatsCache(now = Date.now()) {');
  const end = source.indexOf('async function gitDiffStats(rootPath) {', start);

  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);

  return new Function(
    'state',
    'Date',
    `
      const UNTRACKED_DIFF_STATS_CACHE_TTL_MS = 250;
      const UNTRACKED_DIFF_STATS_CACHE_MAX_ENTRIES = 2;
      ${source.slice(start, end)}
      return { getCachedUntrackedDiffStats, setCachedUntrackedDiffStats };
    `
  )(state, { now }) as {
    getCachedUntrackedDiffStats: (cacheKey: string) => unknown;
    setCachedUntrackedDiffStats: (cacheKey: string, value: unknown) => void;
  };
}

function createGeneratedFinalClientCleanup(
  source: string,
  state: {
    clients: Set<unknown>;
    sessions: Map<string, unknown>;
    watchers: Map<string, { close: () => void }>;
    activeSearches: Map<string, { kill: () => void }>;
    untrackedDiffStatsCache: Map<string, unknown>;
  },
  tmuxScrollPaneCache: Map<string, unknown>,
  clientWriteStates: Map<unknown, unknown>,
  discardSessionOutput: (sessionId: string) => void
): () => void {
  const start = source.indexOf('function cleanupFinalClientState() {');
  const end = source.indexOf('function killChildTree(session) {', start);

  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);

  return new Function(
    'state',
    'tmuxScrollPaneCache',
    'clientWriteStates',
    'discardSessionOutput',
    `${source.slice(start, end)} return pauseAttachedSessions;`
  )(state, tmuxScrollPaneCache, clientWriteStates, discardSessionOutput) as () => void;
}

describe('getRemoteServerSource', () => {
  it('parses the generated remote helper source', () => {
    const source = getRemoteServerSource();

    expect(() => new Function(source.replace(/^#!.*\r?\n/, ''))).not.toThrow();
  });

  it('bounds generated remote JSON-line input before it accumulates indefinitely', () => {
    const source = getRemoteServerSource();

    expect(source).toContain('const JSON_LINE_MAX_CHARS = 4 * 1024 * 1024;');
    expect(source).toContain('if (buffer.length > JSON_LINE_MAX_CHARS) {');
    expect(source).toContain('stream.destroy();');
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
    const sessionOutputQueues = new Map<
      string,
      { chunks: string[]; queuedChars: number; timer: unknown }
    >();
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
    expect(source).toContain('function flushSessionOutput(sessionId, drainAll = false) {');
    expect(source).toContain('function discardSessionOutput(sessionId) {');
    expect(source).toContain(
      'setTimeout(() => flushSessionOutput(sessionId), SESSION_OUTPUT_BATCH_DELAY_MS)'
    );
    expect(source).toContain('function takeQueuedSessionOutput(queue, maxChars) {');
    expect(source).toContain('queue.chunks.push(nextChunk);');
    expect(source).toContain('queue.queuedChars += nextChunk.length;');
    expect(source).toContain('enqueueSessionOutput(session, chunk);');
  });

  it('uses bounded chunk queues and requests replay resync after remote output overflow', () => {
    const source = getRemoteServerSource();

    expect(source).toContain('const SESSION_OUTPUT_PENDING_CHAR_LIMIT = 512 * 1024;');
    expect(source).toContain('chunks: [],');
    expect(source).toContain('queuedChars: 0,');
    expect(source).toContain("broadcast('session:output-resync', {");
    expect(source).not.toContain('queue.data += nextChunk;');
  });

  it('drains generated remote output in order and replaces overflow with replay resync', () => {
    const source = getRemoteServerSource();
    const createSessionFunctions = createGeneratedSessionFunctions(source);
    const session: GeneratedSession = {
      sessionId: 'remote-output',
      kind: 'agent',
      replay: 'replay snapshot',
      lastDataAt: 0,
      streamState: 'live',
      attachCount: 1,
      pendingExit: null,
      writable: null,
    };
    const state = {
      clients: new Set<unknown>([{}]),
      sessions: new Map<string, GeneratedSession>([[session.sessionId, session]]),
    };
    const queues = new Map<string, { chunks: string[]; queuedChars: number; timer: unknown }>();
    const events: GeneratedSessionEvent[] = [];
    const { enqueueSessionOutput, flushSessionOutput } = createSessionFunctions(
      state,
      queues,
      (event, payload) => events.push({ event, payload }),
      () => 0,
      () => {},
      TERMINAL_SESSION_REPLAY_CHAR_LIMIT,
      AGENT_SESSION_REPLAY_CHAR_LIMIT
    );
    const output = 'x'.repeat(64 * 1024 + 7);

    enqueueSessionOutput(session, output);
    flushSessionOutput(session.sessionId, true);

    const dataEvents = events.filter((event) => event.event === 'session:data');
    expect(dataEvents.map((event) => event.payload.data).join('')).toBe(output);
    expect(dataEvents.every((event) => (event.payload.data?.length ?? 0) <= 64 * 1024)).toBe(true);
    expect(queues.size).toBe(0);

    enqueueSessionOutput(session, 'y'.repeat(512 * 1024 + 1));
    expect(events.at(-1)).toEqual({
      event: 'session:output-resync',
      payload: { sessionId: 'remote-output', replay: 'replay snapshot' },
    });
    expect(queues.size).toBe(0);
  });

  it('bounds remote client write queues when socket backpressure applies', () => {
    const source = getRemoteServerSource();

    expect(source).toContain('const SESSION_OUTPUT_CLIENT_QUEUE_MAX_CHARS = 512 * 1024;');
    expect(source).toContain('const clientWriteStates = new Map();');
    expect(source).toContain('function flushClientWrites(stream, writeState) {');
    expect(source).toContain('if (!stream.write(line)) {');
    expect(source).toContain('if (state.queuedChars > SESSION_OUTPUT_CLIENT_QUEUE_MAX_CHARS) {');
    expect(source).toContain('stream.destroy();');
  });

  it('flushes live output before session exit and discards queues without consumers', () => {
    const source = getRemoteServerSource();
    const exitFlushIndex = source.indexOf('flushSessionOutput(session.sessionId, true);');
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

  it('expires and evicts generated tmux and untracked caches deterministically', () => {
    let timestamp = 0;
    const now = () => timestamp;
    const tmuxCache = new Map<string, unknown>();
    const { getCachedTmuxScrollPane, setCachedTmuxScrollPane } = createGeneratedTmuxCacheFunctions(
      getRemoteServerSource(),
      tmuxCache,
      now
    );

    setCachedTmuxScrollPane('server', 'one', { paneId: '%1', inMode: false });
    setCachedTmuxScrollPane('server', 'two', { paneId: '%2', inMode: false });
    expect(getCachedTmuxScrollPane('server', 'one')).toEqual({ paneId: '%1', inMode: false });
    setCachedTmuxScrollPane('server', 'three', { paneId: '%3', inMode: true });
    expect(getCachedTmuxScrollPane('server', 'two')).toBeNull();
    timestamp = 251;
    expect(getCachedTmuxScrollPane('server', 'one')).toBeNull();

    const untrackedState = { untrackedDiffStatsCache: new Map<string, unknown>() };
    const { getCachedUntrackedDiffStats, setCachedUntrackedDiffStats } =
      createGeneratedUntrackedCacheFunctions(getRemoteServerSource(), untrackedState, now);
    timestamp = 0;
    setCachedUntrackedDiffStats('one', { marker: 'one' });
    setCachedUntrackedDiffStats('two', { marker: 'two' });
    expect(getCachedUntrackedDiffStats('one')).toEqual(expect.objectContaining({ marker: 'one' }));
    setCachedUntrackedDiffStats('three', { marker: 'three' });
    expect(getCachedUntrackedDiffStats('two')).toBeNull();
    timestamp = 251;
    expect(getCachedUntrackedDiffStats('one')).toBeNull();
  });

  it('cleans generated watchers, searches, caches, and client writes after the final client leaves', () => {
    const watcher = {
      closed: false,
      close: () => {
        watcher.closed = true;
      },
    };
    const search = {
      killed: false,
      kill: () => {
        search.killed = true;
      },
    };
    const state = {
      clients: new Set<unknown>(),
      sessions: new Map<string, unknown>(),
      watchers: new Map([['watcher', watcher]]),
      activeSearches: new Map([['search', search]]),
      untrackedDiffStatsCache: new Map<string, unknown>([['cache', {}]]),
    };
    const tmuxCache = new Map<string, unknown>([['cache', {}]]);
    const clientWriteStates = new Map<unknown, unknown>([[{}, {}]]);
    const discardedSessionIds: string[] = [];
    const pauseAttachedSessions = createGeneratedFinalClientCleanup(
      getRemoteServerSource(),
      state,
      tmuxCache,
      clientWriteStates,
      (sessionId) => discardedSessionIds.push(sessionId)
    );

    pauseAttachedSessions();

    expect(watcher.closed).toBe(true);
    expect(search.killed).toBe(true);
    expect(state.watchers.size).toBe(0);
    expect(state.activeSearches.size).toBe(0);
    expect(state.untrackedDiffStatsCache.size).toBe(0);
    expect(tmuxCache.size).toBe(0);
    expect(clientWriteStates.size).toBe(0);
    expect(discardedSessionIds).toEqual([]);
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
