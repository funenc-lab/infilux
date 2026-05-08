import type { SessionRuntimeState } from '@shared/types';
import { describe, expect, it } from 'vitest';
import type { Session } from '../SessionBar';
import { shouldIgnoreTerminalRuntimeStateRecoveryUpdate } from '../sessionRuntimeRecoveryPolicy';

function createSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    sessionId: 'provider-session-1',
    backendSessionId: 'backend-session-1',
    createdAt: 1,
    name: 'Codex',
    agentId: 'codex',
    agentCommand: 'codex',
    initialized: true,
    activated: true,
    repoPath: '/repo',
    cwd: '/repo/worktree',
    environment: 'native',
    persistenceEnabled: true,
    ...overrides,
  };
}

describe('sessionRuntimeRecoveryPolicy', () => {
  it('ignores default live runtime updates for recovered metadata-only sessions', () => {
    expect(
      shouldIgnoreTerminalRuntimeStateRecoveryUpdate(
        createSession({
          recovered: true,
          backendSessionId: undefined,
          recoveryState: 'missing-host-session',
        }),
        'live'
      )
    ).toBe(true);

    expect(
      shouldIgnoreTerminalRuntimeStateRecoveryUpdate(
        createSession({
          recovered: true,
          backendSessionId: undefined,
          recoveryState: 'dead',
        }),
        'live'
      )
    ).toBe(true);
  });

  it('keeps terminal runtime updates for active or already attached sessions', () => {
    const states: SessionRuntimeState[] = ['live', 'reconnecting', 'dead'];

    for (const runtimeState of states) {
      expect(
        shouldIgnoreTerminalRuntimeStateRecoveryUpdate(
          createSession({
            recovered: false,
            recoveryState: 'live',
          }),
          runtimeState
        )
      ).toBe(false);
    }

    expect(
      shouldIgnoreTerminalRuntimeStateRecoveryUpdate(
        createSession({
          recovered: true,
          recoveryState: 'missing-host-session',
          backendSessionId: 'backend-session-1',
        }),
        'live'
      )
    ).toBe(false);
  });
});
