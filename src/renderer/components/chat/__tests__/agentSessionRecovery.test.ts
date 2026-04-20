import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mergeRecoveredSessionsIntoGroupState,
  resetWorktreeAgentSessionRecoveryCacheForTests,
  restoreWorktreeAgentSessions,
} from '../agentSessionRecovery';
import { type AgentGroupState, createInitialGroupState } from '../types';

function createRecoverableRestoreResult(uiSessionId = 'session-1') {
  return {
    items: [
      {
        recoverable: true,
        runtimeState: 'live' as const,
        record: {
          uiSessionId,
          backendSessionId: `backend-${uiSessionId}`,
          providerSessionId: `provider-${uiSessionId}`,
          agentId: 'codex',
          agentCommand: 'codex',
          environment: 'native' as const,
          repoPath: '/repo',
          cwd: '/repo/worktree',
          displayName: 'Codex',
          activated: true,
          initialized: true,
          hostKind: 'tmux' as const,
          hostSessionKey: `enso-${uiSessionId}`,
          recoveryPolicy: 'auto' as const,
          createdAt: 1,
          updatedAt: 2,
          lastKnownState: 'live' as const,
        },
      },
    ],
  };
}

function createNonRecoverableRestoreResult(
  uiSessionId = 'session-dead',
  runtimeState: 'dead' | 'missing-host-session' = 'missing-host-session'
) {
  return {
    items: [
      {
        recoverable: false,
        runtimeState,
        reason: runtimeState === 'dead' ? 'session-dead' : 'missing-host-session',
        record: {
          uiSessionId,
          backendSessionId: `backend-${uiSessionId}`,
          providerSessionId: `provider-${uiSessionId}`,
          agentId: 'codex',
          agentCommand: 'codex',
          environment: 'native' as const,
          repoPath: '/repo',
          cwd: '/repo/worktree',
          displayName: 'Codex',
          activated: true,
          initialized: true,
          hostKind: 'tmux' as const,
          hostSessionKey: `enso-${uiSessionId}`,
          recoveryPolicy: 'auto' as const,
          createdAt: 1,
          updatedAt: 2,
          lastKnownState: runtimeState,
        },
      },
    ],
  };
}

describe('agentSessionRecovery', () => {
  beforeEach(() => {
    resetWorktreeAgentSessionRecoveryCacheForTests();
  });

  it('creates an initial group when recovered sessions arrive for an empty worktree', () => {
    const nextState = mergeRecoveredSessionsIntoGroupState(createInitialGroupState(), [
      'session-1',
      'session-2',
    ]);

    expect(nextState.groups).toHaveLength(1);
    expect(nextState.groups[0]).toMatchObject({
      sessionIds: ['session-1', 'session-2'],
      activeSessionId: 'session-1',
    });
    expect(nextState.activeGroupId).toBe(nextState.groups[0]?.id);
    expect(nextState.flexPercents).toEqual([100]);
  });

  it('repairs a missing active group id while preserving the restored session selection', () => {
    const nextState = mergeRecoveredSessionsIntoGroupState(
      {
        groups: [
          {
            id: 'group-1',
            sessionIds: ['session-1'],
            activeSessionId: 'session-1',
          },
        ],
        activeGroupId: null,
        flexPercents: [100],
      },
      ['session-1']
    );

    expect(nextState.groups).toEqual([
      {
        id: 'group-1',
        sessionIds: ['session-1'],
        activeSessionId: 'session-1',
      },
    ]);
    expect(nextState.activeGroupId).toBe('group-1');
    expect(nextState.flexPercents).toEqual([100]);
  });

  it('repairs a missing active session id inside the selected group', () => {
    const nextState = mergeRecoveredSessionsIntoGroupState(
      {
        groups: [
          {
            id: 'group-1',
            sessionIds: ['session-1', 'session-2'],
            activeSessionId: null,
          },
        ],
        activeGroupId: 'group-1',
        flexPercents: [100],
      },
      ['session-1']
    );

    expect(nextState).toEqual({
      groups: [
        {
          id: 'group-1',
          sessionIds: ['session-1', 'session-2'],
          activeSessionId: 'session-1',
        },
      ],
      activeGroupId: 'group-1',
      flexPercents: [100],
    });
  });

  it('appends only missing recovered session ids to the active group', () => {
    const nextState = mergeRecoveredSessionsIntoGroupState(
      {
        groups: [
          {
            id: 'group-1',
            sessionIds: ['session-1'],
            activeSessionId: 'session-1',
          },
        ],
        activeGroupId: 'group-1',
        flexPercents: [100],
      },
      ['session-1', 'session-2']
    );

    expect(nextState).toEqual({
      groups: [
        {
          id: 'group-1',
          sessionIds: ['session-1', 'session-2'],
          activeSessionId: 'session-1',
        },
      ],
      activeGroupId: 'group-1',
      flexPercents: [100],
    });
  });

  it('deduplicates concurrent restore requests for the same worktree', async () => {
    let resolveRestore!: (value: ReturnType<typeof createRecoverableRestoreResult>) => void;
    const restoreWorktreeSessions = vi.fn(
      () =>
        new Promise<ReturnType<typeof createRecoverableRestoreResult>>((resolve) => {
          resolveRestore = resolve;
        })
    );
    const upsertRecoveredSession = vi.fn();
    let groupState: AgentGroupState = createInitialGroupState();
    const updateGroupState = vi.fn(
      (cwd: string, updater: (state: AgentGroupState) => AgentGroupState) => {
        expect(cwd).toBe('/repo/worktree');
        groupState = updater(groupState);
      }
    );

    const firstRequest = restoreWorktreeAgentSessions({
      repoPath: '/repo',
      cwd: '/repo/worktree',
      restoreWorktreeSessions,
      upsertRecoveredSession,
      updateGroupState,
    });
    const secondRequest = restoreWorktreeAgentSessions({
      repoPath: '/repo',
      cwd: '/repo/worktree',
      restoreWorktreeSessions,
      upsertRecoveredSession,
      updateGroupState,
    });

    expect(restoreWorktreeSessions).toHaveBeenCalledTimes(1);

    resolveRestore(createRecoverableRestoreResult('session-1'));
    const [firstResult, secondResult] = await Promise.all([firstRequest, secondRequest]);

    expect(firstResult).toEqual(['session-1']);
    expect(secondResult).toEqual(['session-1']);
    expect(upsertRecoveredSession).toHaveBeenCalledTimes(1);
    expect(updateGroupState).toHaveBeenCalledTimes(1);
    expect(groupState).toEqual({
      groups: [
        expect.objectContaining({
          sessionIds: ['session-1'],
          activeSessionId: 'session-1',
        }),
      ],
      activeGroupId: expect.any(String),
      flexPercents: [100],
    });
  });

  it('restores recoverable sessions only once per worktree after a successful prewarm', async () => {
    const restoreWorktreeSessions = vi.fn().mockResolvedValue(createRecoverableRestoreResult());
    const upsertRecoveredSession = vi.fn();
    let groupState: AgentGroupState = createInitialGroupState();
    const updateGroupState = vi.fn(
      (cwd: string, updater: (state: AgentGroupState) => AgentGroupState) => {
        expect(cwd).toBe('/repo/worktree');
        groupState = updater(groupState);
      }
    );

    await restoreWorktreeAgentSessions({
      repoPath: '/repo',
      cwd: '/repo/worktree',
      restoreWorktreeSessions,
      upsertRecoveredSession,
      updateGroupState,
    });

    await restoreWorktreeAgentSessions({
      repoPath: '/repo',
      cwd: '/repo/worktree',
      restoreWorktreeSessions,
      upsertRecoveredSession,
      updateGroupState,
    });

    expect(restoreWorktreeSessions).toHaveBeenCalledTimes(1);
    expect(upsertRecoveredSession).toHaveBeenCalledWith(
      expect.objectContaining({
        uiSessionId: 'session-1',
        backendSessionId: 'backend-session-1',
      })
    );
    expect(groupState.groups[0]).toMatchObject({
      sessionIds: ['session-1'],
      activeSessionId: 'session-1',
    });
  });

  it('retries the backend restore after a failed attempt', async () => {
    const restoreWorktreeSessions = vi
      .fn()
      .mockRejectedValueOnce(new Error('restore failed'))
      .mockResolvedValueOnce(createRecoverableRestoreResult('session-2'));
    const upsertRecoveredSession = vi.fn();
    let groupState: AgentGroupState = createInitialGroupState();
    const updateGroupState = vi.fn(
      (_cwd: string, updater: (state: AgentGroupState) => AgentGroupState) => {
        groupState = updater(groupState);
      }
    );

    await expect(
      restoreWorktreeAgentSessions({
        repoPath: '/repo',
        cwd: '/repo/worktree',
        restoreWorktreeSessions,
        upsertRecoveredSession,
        updateGroupState,
      })
    ).rejects.toThrow('restore failed');

    await expect(
      restoreWorktreeAgentSessions({
        repoPath: '/repo',
        cwd: '/repo/worktree',
        restoreWorktreeSessions,
        upsertRecoveredSession,
        updateGroupState,
      })
    ).resolves.toEqual(['session-2']);

    expect(restoreWorktreeSessions).toHaveBeenCalledTimes(2);
    expect(upsertRecoveredSession).toHaveBeenCalledWith(
      expect.objectContaining({ uiSessionId: 'session-2' })
    );
    expect(groupState.groups[0]).toMatchObject({
      sessionIds: ['session-2'],
      activeSessionId: 'session-2',
    });
  });

  it('does not cache empty restore results so a later recovery can still succeed', async () => {
    const restoreWorktreeSessions = vi
      .fn()
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce(createRecoverableRestoreResult('session-3'));
    const upsertRecoveredSession = vi.fn();
    let groupState: AgentGroupState = createInitialGroupState();
    const updateGroupState = vi.fn(
      (_cwd: string, updater: (state: AgentGroupState) => AgentGroupState) => {
        groupState = updater(groupState);
      }
    );

    await expect(
      restoreWorktreeAgentSessions({
        repoPath: '/repo',
        cwd: '/repo/worktree',
        restoreWorktreeSessions,
        upsertRecoveredSession,
        updateGroupState,
      })
    ).resolves.toEqual([]);

    await expect(
      restoreWorktreeAgentSessions({
        repoPath: '/repo',
        cwd: '/repo/worktree',
        restoreWorktreeSessions,
        upsertRecoveredSession,
        updateGroupState,
      })
    ).resolves.toEqual(['session-3']);

    expect(restoreWorktreeSessions).toHaveBeenCalledTimes(2);
    expect(upsertRecoveredSession).toHaveBeenCalledWith(
      expect.objectContaining({ uiSessionId: 'session-3' })
    );
    expect(groupState.groups[0]).toMatchObject({
      sessionIds: ['session-3'],
      activeSessionId: 'session-3',
    });
  });

  it('hydrates disconnected sessions so worktrees do not recover as empty when the host is gone', async () => {
    const restoreWorktreeSessions = vi
      .fn()
      .mockResolvedValue(createNonRecoverableRestoreResult('session-missing'));
    const upsertRecoveredSession = vi.fn();
    let groupState: AgentGroupState = createInitialGroupState();
    const updateGroupState = vi.fn(
      (_cwd: string, updater: (state: AgentGroupState) => AgentGroupState) => {
        groupState = updater(groupState);
      }
    );

    await expect(
      restoreWorktreeAgentSessions({
        repoPath: '/repo',
        cwd: '/repo/worktree',
        restoreWorktreeSessions,
        upsertRecoveredSession,
        updateGroupState,
      })
    ).resolves.toEqual(['session-missing']);

    expect(upsertRecoveredSession).toHaveBeenCalledWith(
      expect.objectContaining({
        uiSessionId: 'session-missing',
        lastKnownState: 'missing-host-session',
      })
    );
    expect(groupState.groups[0]).toMatchObject({
      sessionIds: ['session-missing'],
      activeSessionId: 'session-missing',
    });
  });

  it('skips remote worktrees entirely', async () => {
    const restoreWorktreeSessions = vi.fn();

    const result = await restoreWorktreeAgentSessions({
      repoPath: '/repo',
      cwd: '/__enso_remote__/conn/home/project',
      restoreWorktreeSessions,
      upsertRecoveredSession: vi.fn(),
      updateGroupState: vi.fn(),
    });

    expect(result).toEqual([]);
    expect(restoreWorktreeSessions).not.toHaveBeenCalled();
  });
});
