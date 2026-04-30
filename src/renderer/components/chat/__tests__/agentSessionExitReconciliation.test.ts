import type { AgentSessionRestoreItem, PersistentAgentSessionRecord } from '@shared/types';
import { describe, expect, it, vi } from 'vitest';
import { reconcileAgentSessionExit } from '../agentSessionExitReconciliation';
import type { Session } from '../SessionBar';

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    sessionId: 'provider-1',
    backendSessionId: 'backend-1',
    name: 'Codex',
    agentId: 'codex',
    agentCommand: 'codex',
    initialized: true,
    activated: true,
    persistenceEnabled: true,
    repoPath: '/repo',
    cwd: '/repo/worktree',
    environment: 'native',
    ...overrides,
  };
}

function makeRecord(
  overrides: Partial<PersistentAgentSessionRecord> = {}
): PersistentAgentSessionRecord {
  return {
    uiSessionId: 'session-1',
    backendSessionId: 'backend-1',
    providerSessionId: 'provider-1',
    agentId: 'codex',
    agentCommand: 'codex',
    environment: 'native',
    repoPath: '/repo',
    cwd: '/repo/worktree',
    displayName: 'Codex',
    activated: true,
    initialized: true,
    hostKind: 'tmux',
    hostSessionKey: 'infilux-session-1',
    recoveryPolicy: 'auto',
    createdAt: 1,
    updatedAt: 2,
    lastKnownState: 'live',
    ...overrides,
  };
}

function makeRestoreItem(
  overrides: Partial<AgentSessionRestoreItem> = {}
): AgentSessionRestoreItem {
  const record = makeRecord(overrides.record);
  return {
    record,
    runtimeState: record.lastKnownState,
    recoverable: record.lastKnownState === 'live' || record.lastKnownState === 'reconnecting',
    ...overrides,
  };
}

describe('agentSessionExitReconciliation', () => {
  it('keeps a persistent session live when exit reconciliation finds the host session alive', async () => {
    const markSessionExited = vi.fn();
    const reconcileSession = vi.fn().mockResolvedValue(makeRestoreItem());

    await reconcileAgentSessionExit({
      sessionId: 'session-1',
      getSession: () => makeSession(),
      reconcileSession,
      markSessionExited,
    });

    expect(reconcileSession).toHaveBeenCalledWith('session-1');
    expect(markSessionExited).toHaveBeenCalledWith('session-1', 'live');
  });

  it('marks a persistent session dead when reconciliation confirms the host session is dead', async () => {
    const markSessionExited = vi.fn();
    const reconcileSession = vi.fn().mockResolvedValue(
      makeRestoreItem({
        record: makeRecord({ lastKnownState: 'dead' }),
        runtimeState: 'dead',
        recoverable: false,
        reason: 'session-dead',
      })
    );

    await reconcileAgentSessionExit({
      sessionId: 'session-1',
      getSession: () => makeSession(),
      reconcileSession,
      markSessionExited,
    });

    expect(markSessionExited).toHaveBeenCalledWith('session-1', 'dead');
  });

  it('marks a persistent session dead when reconciliation does not find a matching record', async () => {
    const markSessionExited = vi.fn();
    const reconcileSession = vi.fn().mockResolvedValue(null);

    await reconcileAgentSessionExit({
      sessionId: 'session-1',
      getSession: () => makeSession({ recoveryState: 'live' }),
      reconcileSession,
      markSessionExited,
    });

    expect(markSessionExited).toHaveBeenCalledWith('session-1', 'dead');
  });

  it('falls back to dead for non-persistable sessions without calling reconciliation', async () => {
    const markSessionExited = vi.fn();
    const reconcileSession = vi.fn();

    await reconcileAgentSessionExit({
      sessionId: 'session-1',
      getSession: () => makeSession({ persistenceEnabled: false }),
      reconcileSession,
      markSessionExited,
    });

    expect(reconcileSession).not.toHaveBeenCalled();
    expect(markSessionExited).toHaveBeenCalledWith('session-1', 'dead');
  });

  it('preserves the current recoverable state when persistent session reconciliation fails', async () => {
    const markSessionExited = vi.fn();
    const reconcileSession = vi.fn().mockRejectedValue(new Error('reconcile failed'));

    await reconcileAgentSessionExit({
      sessionId: 'session-1',
      getSession: () => makeSession({ recoveryState: 'live' }),
      reconcileSession,
      markSessionExited,
    });

    expect(markSessionExited).toHaveBeenCalledWith('session-1', 'live');
  });
});
