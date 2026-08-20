import {
  AGENT_SESSION_REPLAY_CHAR_LIMIT,
  TERMINAL_SESSION_REPLAY_CHAR_LIMIT,
} from '@shared/utils/agentTerminalHistoryPolicy';
import { describe, expect, it } from 'vitest';
import {
  getLocalSupervisorSource,
  LOCAL_SUPERVISOR_RUNTIME_VERSION,
} from '../LocalSupervisorSource';

type GeneratedLocalSupervisorSession = {
  kind: 'agent' | 'terminal';
  replay: string;
};

type GeneratedLocalReplayAppender = (
  session: GeneratedLocalSupervisorSession,
  chunk: string
) => string;

type GeneratedLocalOutputFunctions = {
  queueSessionOutput: (session: { sessionId: string; replay: string }, data: string) => void;
  flushSessionOutput: (sessionId: string, drainAll?: boolean) => void;
};

function createGeneratedLocalReplayAppender(source: string): GeneratedLocalReplayAppender {
  const start = source.indexOf('function getSessionReplayCharLimit(session) {');
  const end = source.indexOf('function loadNodePty()', start);

  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);

  return new Function(
    'TERMINAL_SESSION_REPLAY_CHAR_LIMIT',
    'AGENT_SESSION_REPLAY_CHAR_LIMIT',
    `${source.slice(start, end)}\nreturn appendReplayTail;`
  )(
    TERMINAL_SESSION_REPLAY_CHAR_LIMIT,
    AGENT_SESSION_REPLAY_CHAR_LIMIT
  ) as GeneratedLocalReplayAppender;
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
      return { queueSessionOutput, flushSessionOutput };
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

describe('getLocalSupervisorSource', () => {
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
    expect(source).toContain('session.replay = appendReplayTail(session, data);');
    expect(source).not.toContain('REPLAY_LIMIT_CHARS');
  });

  it('keeps generated local supervisor replay tails Unicode-safe', () => {
    const appendReplayTail = createGeneratedLocalReplayAppender(getLocalSupervisorSource());
    const trailing = 't'.repeat(TERMINAL_SESSION_REPLAY_CHAR_LIMIT - 1);

    expect(appendReplayTail({ kind: 'terminal', replay: '' }, `A\u{1F680}${trailing}`)).toBe(
      trailing
    );
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
    const { queueSessionOutput, flushSessionOutput } = createGeneratedLocalOutputFunctions(
      getLocalSupervisorSource(),
      queues,
      (event, payload) =>
        events.push({
          event,
          payload: payload as { sessionId?: string; data?: string; replay?: string },
        })
    );
    const session = { sessionId: 'supervisor-output', replay: 'replay snapshot' };
    const output = 'x'.repeat(64 * 1024 + 7);

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

    expect(source).toContain('const JSON_LINE_MAX_CHARS = 4 * 1024 * 1024;');
    expect(source).toContain('if (buffer.length > JSON_LINE_MAX_CHARS) {');
    expect(source).toContain('stream.destroy();');
  });
});
