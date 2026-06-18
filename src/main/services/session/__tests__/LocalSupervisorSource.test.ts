import {
  AGENT_SESSION_REPLAY_CHAR_LIMIT,
  TERMINAL_SESSION_REPLAY_CHAR_LIMIT,
} from '@shared/utils/agentTerminalHistoryPolicy';
import { describe, expect, it } from 'vitest';
import {
  getLocalSupervisorSource,
  LOCAL_SUPERVISOR_RUNTIME_VERSION,
} from '../LocalSupervisorSource';

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
});
