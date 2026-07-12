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
});
