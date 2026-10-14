import {
  AGENT_SESSION_REPLAY_CHAR_LIMIT,
  TERMINAL_SESSION_REPLAY_CHAR_LIMIT,
} from '@shared/utils/agentTerminalHistoryPolicy';
import { describe, expect, it, vi } from 'vitest';
import {
  getLocalSupervisorSource,
  LOCAL_SUPERVISOR_RUNTIME_VERSION,
} from '../LocalSupervisorSource';

type GeneratedLocalSupervisorSession = {
  kind: 'agent' | 'terminal';
  replayBuffer?: { readonly length: number; toString: () => string };
};

type GeneratedLocalReplayFunctions = {
  appendReplayTail: (session: GeneratedLocalSupervisorSession, chunk: string) => void;
  getSessionReplay: (session: GeneratedLocalSupervisorSession) => string;
};

type GeneratedLocalOutputFunctions = GeneratedLocalReplayFunctions & {
  queueSessionOutput: (
    session: GeneratedLocalSupervisorSession & { sessionId: string },
    data: string
  ) => void;
  flushSessionOutput: (sessionId: string, drainAll?: boolean) => void;
};

function createGeneratedLocalReplayFunctions(source: string): GeneratedLocalReplayFunctions {
  const start = source.indexOf('function getSessionReplayCharLimit(session) {');
  const end = source.indexOf('function loadNodePty()', start);

  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);

  return new Function(
    'TERMINAL_SESSION_REPLAY_CHAR_LIMIT',
    'AGENT_SESSION_REPLAY_CHAR_LIMIT',
    `${source.slice(start, end)}\nreturn { appendReplayTail, getSessionReplay };`
  )(
    TERMINAL_SESSION_REPLAY_CHAR_LIMIT,
    AGENT_SESSION_REPLAY_CHAR_LIMIT
  ) as GeneratedLocalReplayFunctions;
}

function createGeneratedLocalOutputFunctions(
  source: string,
  sessionOutputQueues: Map<string, unknown>,
  broadcast: (event: string, payload: unknown) => void
): GeneratedLocalOutputFunctions {
  const start = source.indexOf('function getSessionReplayCharLimit(session) {');
  const end = source.indexOf('function loadNodePty()', start);

  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);

  return new Function(
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
      ${source.slice(start, end)}
      return { queueSessionOutput, flushSessionOutput, appendReplayTail, getSessionReplay };
    `
  )(
    sessionOutputQueues,
    broadcast,
    () => 0,
    () => {},
    TERMINAL_SESSION_REPLAY_CHAR_LIMIT,
    AGENT_SESSION_REPLAY_CHAR_LIMIT
  ) as GeneratedLocalOutputFunctions;
}

function createGeneratedLocalSnapshotFunctions(
  source: string,
  sessions: Map<
    string,
    GeneratedLocalSupervisorSession & { sessionId: string; attachCount: number }
  >
): GeneratedLocalReplayFunctions & {
  attachSession: (params: {
    sessionId: string;
  }) => Promise<{ replay: string; session: { sessionId: string } }>;
  getSessionSnapshot: (params: {
    sessionId: string;
  }) => Promise<{ replay: string; session: { sessionId: string } }>;
} {
  const helpers = source.slice(
    source.indexOf('function getSessionReplayCharLimit(session) {'),
    source.indexOf('function loadNodePty()')
  );
  const descriptor = source.slice(
    source.indexOf('function createDescriptor(session) {'),
    source.indexOf('function finalizeSessionExit(')
  );
  const readers = source.slice(
    source.indexOf('async function attachSession(params = {}) {'),
    source.indexOf('async function detachSession(params = {}) {')
  );
  return new Function(
    'state',
    'TERMINAL_SESSION_REPLAY_CHAR_LIMIT',
    'AGENT_SESSION_REPLAY_CHAR_LIMIT',
    `${helpers}\n${descriptor}\n${readers}\nreturn { appendReplayTail, getSessionReplay, attachSession, getSessionSnapshot };`
  )(
    { sessions },
    TERMINAL_SESSION_REPLAY_CHAR_LIMIT,
    AGENT_SESSION_REPLAY_CHAR_LIMIT
  ) as ReturnType<typeof createGeneratedLocalSnapshotFunctions>;
}

describe('getLocalSupervisorSource', () => {
  it('retains incremental supervisor output without materializing replay on append', () => {
    const source = getLocalSupervisorSource();
    const { appendReplayTail, getSessionReplay } = createGeneratedLocalReplayFunctions(source);
    const session: GeneratedLocalSupervisorSession = { kind: 'agent' };
    appendReplayTail(session, 'first\n');

    expect(session.replayBuffer).toBeDefined();
    if (!session.replayBuffer) return;
    const materialize = vi.spyOn(session.replayBuffer, 'toString');
    for (let index = 0; index < 64; index += 1) {
      appendReplayTail(session, `line ${index}\n`);
    }
    const expected = `first\n${Array.from({ length: 64 }, (_, index) => `line ${index}\n`).join('')}`;

    expect(materialize).not.toHaveBeenCalled();
    expect(session.replayBuffer.length).toBe(expected.length);
    expect(getSessionReplay(session)).toBe(expected);
    expect(materialize).toHaveBeenCalledTimes(1);
  });

  it('parses the generated local supervisor source', () => {
    const source = getLocalSupervisorSource().replace(/^#!.*\r?\n/, '');

    expect(() => new Function(source)).not.toThrow();
  });

  it('materializes current supervisor replay for attach and non-attaching snapshots', async () => {
    const session = { sessionId: 'supervisor-snapshot', kind: 'agent' as const, attachCount: 0 };
    const { appendReplayTail, attachSession, getSessionSnapshot } =
      createGeneratedLocalSnapshotFunctions(
        getLocalSupervisorSource(),
        new Map([[session.sessionId, session]])
      );
    appendReplayTail(session, 'first\n');

    const attached = await attachSession({ sessionId: session.sessionId });
    expect(attached.replay).toBe('first\n');
    expect(attached.session.sessionId).toBe(session.sessionId);
    expect(attached.session).not.toHaveProperty('replayBuffer');
    expect(session.attachCount).toBe(1);

    appendReplayTail(session, 'second\n');
    const snapshot = await getSessionSnapshot({ sessionId: session.sessionId });

    expect(snapshot.replay).toBe('first\nsecond\n');
    expect(session.attachCount).toBe(1);
  });

  it.each(['agent', 'terminal'] as const)('enforces the supervisor %s replay budget', (kind) => {
    const session: GeneratedLocalSupervisorSession = { kind };
    const { appendReplayTail, getSessionReplay } = createGeneratedLocalReplayFunctions(
      getLocalSupervisorSource()
    );
    const limit =
      kind === 'agent' ? AGENT_SESSION_REPLAY_CHAR_LIMIT : TERMINAL_SESSION_REPLAY_CHAR_LIMIT;

    appendReplayTail(session, 'x'.repeat(limit - 1));
    appendReplayTail(session, 'tail');

    expect(session.replayBuffer?.length).toBe(limit);
    expect(getSessionReplay(session)).toBe(`${'x'.repeat(limit - 4)}tail`);
  });

  it('keeps the generated runtime version available in the source', () => {
    expect(getLocalSupervisorSource()).toContain(
      `const LOCAL_SUPERVISOR_RUNTIME_VERSION = ${JSON.stringify(LOCAL_SUPERVISOR_RUNTIME_VERSION)};`
    );
  });

  it('uses the expanded replay budget for local supervisor agent sessions', () => {
    const source = getLocalSupervisorSource();

    expect(source).toContain(
      `const TERMINAL_SESSION_REPLAY_CHAR_LIMIT = ${TERMINAL_SESSION_REPLAY_CHAR_LIMIT};`
    );
    expect(source).toContain(
      `const AGENT_SESSION_REPLAY_CHAR_LIMIT = ${AGENT_SESSION_REPLAY_CHAR_LIMIT};`
    );
    expect(source).toContain('function getSessionReplayCharLimit(session) {');
    expect(source).toContain('appendReplayTail(session, data);');
    expect(source).not.toContain('session.replay =');
    expect(source).not.toContain('REPLAY_LIMIT_CHARS');
  });

  it('keeps generated local supervisor replay tails Unicode-safe', () => {
    const { appendReplayTail, getSessionReplay } = createGeneratedLocalReplayFunctions(
      getLocalSupervisorSource()
    );
    const trailing = 't'.repeat(TERMINAL_SESSION_REPLAY_CHAR_LIMIT - 1);
    const session: GeneratedLocalSupervisorSession = { kind: 'terminal' };

    appendReplayTail(session, `A\u{1F680}${trailing}`);

    expect(getSessionReplay(session)).toBe(trailing);
  });

  it('drops partial terminal control strings from generated local supervisor replays', () => {
    const { appendReplayTail, getSessionReplay } = createGeneratedLocalReplayFunctions(
      getLocalSupervisorSource()
    );
    const controlString = '\x1bP>|xterm.js(6.1.0-beta.141)\x1b\\';
    const visibleOutput = 'prompt ready\n';
    const retainedOutput = `${visibleOutput}${'x'.repeat(
      TERMINAL_SESSION_REPLAY_CHAR_LIMIT - (controlString.length - 2 + visibleOutput.length)
    )}`;

    const session: GeneratedLocalSupervisorSession = { kind: 'terminal' };

    appendReplayTail(session, `${controlString}${retainedOutput}`);

    expect(getSessionReplay(session)).toBe(retainedOutput);
  });

  it('keeps generated local supervisor replay parser state across an oversized control string', () => {
    const { appendReplayTail, getSessionReplay } = createGeneratedLocalReplayFunctions(
      getLocalSupervisorSource()
    );
    const session = { kind: 'terminal' as const };

    appendReplayTail(session, `\x1bP${'x'.repeat(TERMINAL_SESSION_REPLAY_CHAR_LIMIT + 1)}`);
    appendReplayTail(session, '\x1b\\prompt ready\n');

    expect(getSessionReplay(session)).toBe('prompt ready\n');
  });

  it('archives generated supervisor agent output before broadcasting it to clients', () => {
    const source = getLocalSupervisorSource();

    expect(source).toContain('appendSessionTranscript(session, data);');
    expect(source).toContain(
      "'session:transcript:read': (params) => readSessionTranscriptPage(params),"
    );
    expect(source).toContain(
      "'session:transcript:delete': (params) => deleteSessionTranscript(params),"
    );
  });

  it('batches generated supervisor PTY output before writing it to subscription sockets', () => {
    const source = getLocalSupervisorSource();

    expect(source).toContain('const SESSION_OUTPUT_BATCH_DELAY_MS = 16;');
    expect(source).toContain('const SESSION_OUTPUT_BATCH_MAX_CHARS = 64 * 1024;');
    expect(source).toContain('const sessionOutputQueues = new Map();');
    expect(source).toContain('function queueSessionOutput(session, data) {');
    expect(source).toContain('queueSessionOutput(session, data);');
    expect(source).toContain('const SESSION_OUTPUT_CLIENT_QUEUE_MAX_CHARS = 512 * 1024;');
    expect(source).toContain('const clientWriteStates = new Map();');
    expect(source).toContain('function flushClientWrites(stream, writeState) {');
    expect(source).toContain('if (!stream.write(line)) {');
    expect(source).toContain('stream.destroy();');
  });

  it('uses bounded chunk queues and requests replay resync after supervisor output overflow', () => {
    const source = getLocalSupervisorSource();

    expect(source).toContain('const SESSION_OUTPUT_PENDING_CHAR_LIMIT = 512 * 1024;');
    expect(source).toContain('chunks: [],');
    expect(source).toContain('queuedChars: 0,');
    expect(source).toContain("broadcast('session:output-resync', {");
    expect(source).not.toContain('existing.data += data;');
  });

  it('drains generated supervisor output in order and replaces overflow with replay resync', () => {
    const events: Array<{
      event: string;
      payload: { sessionId?: string; data?: string; replay?: string };
    }> = [];
    const queues = new Map<string, unknown>();
    const { queueSessionOutput, flushSessionOutput, appendReplayTail } =
      createGeneratedLocalOutputFunctions(getLocalSupervisorSource(), queues, (event, payload) =>
        events.push({
          event,
          payload: payload as { sessionId?: string; data?: string; replay?: string },
        })
      );
    const session = { sessionId: 'supervisor-output', kind: 'agent' as const };
    const output = 'x'.repeat(64 * 1024 + 7);

    appendReplayTail(session, 'replay snapshot');
    queueSessionOutput(session, output);
    flushSessionOutput(session.sessionId, true);

    const dataEvents = events.filter((event) => event.event === 'session:data');
    expect(dataEvents.map((event) => event.payload.data).join('')).toBe(output);
    expect(dataEvents.every((event) => (event.payload.data?.length ?? 0) <= 64 * 1024)).toBe(true);
    expect(queues.size).toBe(0);

    queueSessionOutput(session, 'y'.repeat(512 * 1024 + 1));
    expect(events.at(-1)).toEqual({
      event: 'session:output-resync',
      payload: { sessionId: 'supervisor-output', replay: 'replay snapshot' },
    });
    expect(queues.size).toBe(0);
  });

  it('drains all queued supervisor output before emitting a session exit', () => {
    const source = getLocalSupervisorSource();
    const outputFlushIndex = source.indexOf('flushSessionOutput(session.sessionId, true);');
    const exitBroadcastIndex = source.indexOf("broadcast('session:exit', {");

    expect(outputFlushIndex).toBeGreaterThan(-1);
    expect(exitBroadcastIndex).toBeGreaterThan(outputFlushIndex);
  });

  it('bounds generated supervisor JSON-line input before it accumulates indefinitely', () => {
    const source = getLocalSupervisorSource();

    expect(source).toContain('const JSON_LINE_MAX_CHARS = 32 * 1024 * 1024;');
    expect(source).toContain('if (buffer.length > JSON_LINE_MAX_CHARS) {');
    expect(source).toContain('stream.destroy();');
  });

  it('exposes a non-attaching session snapshot for subscription recovery', () => {
    const source = getLocalSupervisorSource();

    expect(source).toContain('async function getSessionSnapshot(params = {}) {');
    expect(source).toContain("'session:snapshot': (params) => getSessionSnapshot(params)");
  });
});
