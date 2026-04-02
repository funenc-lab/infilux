import type { GitWorktree } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEMP_REPO_ID } from '../../constants';

const restoreWorktreeAgentSessions = vi.fn(() => Promise.resolve([]));
const restoreWorktreeSessions = vi.fn(() => Promise.resolve({ items: [] }));
const upsertRecoveredSession = vi.fn();
const updateGroupState = vi.fn();

vi.mock('@/components/chat/agentSessionRecovery', () => ({
  restoreWorktreeAgentSessions,
}));

vi.mock('@/stores/agentSessions', () => ({
  useAgentSessionsStore: (
    selector: (state: {
      upsertRecoveredSession: typeof upsertRecoveredSession;
      updateGroupState: typeof updateGroupState;
    }) => unknown
  ) =>
    selector({
      upsertRecoveredSession,
      updateGroupState,
    }),
}));

function makeWorktree(path: string): GitWorktree {
  return {
    path,
    head: 'abc123',
    branch: 'feature',
    isMainWorktree: false,
    isLocked: false,
    prunable: false,
  };
}

async function loadHook() {
  vi.doMock('react', () => ({
    useEffect: (effect: () => void) => {
      effect();
    },
  }));

  return import('../useStartupAgentSessionRecovery');
}

describe('useStartupAgentSessionRecovery', () => {
  beforeEach(() => {
    restoreWorktreeAgentSessions.mockClear();
    restoreWorktreeSessions.mockClear();
    upsertRecoveredSession.mockClear();
    updateGroupState.mockClear();

    vi.stubGlobal('window', {
      electronAPI: {
        agentSession: {
          restoreWorktreeSessions,
        },
      },
    });
  });

  afterEach(() => {
    vi.resetModules();
    vi.unmock('react');
    vi.unstubAllGlobals();
  });

  it('prewarms recoverable sessions for the validated startup worktree', async () => {
    const { useStartupAgentSessionRecovery } = await loadHook();
    const activeWorktree = makeWorktree('/repo/.worktrees/feature-a');

    useStartupAgentSessionRecovery({
      selectedRepo: '/repo',
      activeWorktree,
      selectedRepoCanLoad: true,
      worktreesFetched: true,
      worktreesFetching: false,
      availableWorktreePaths: ['/repo', '/repo/.worktrees/feature-a'],
    });

    expect(restoreWorktreeAgentSessions).toHaveBeenCalledWith({
      repoPath: '/repo',
      cwd: '/repo/.worktrees/feature-a',
      restoreWorktreeSessions,
      upsertRecoveredSession,
      updateGroupState,
    });
  });

  it('skips prewarm when the active worktree path has not been validated by the loaded worktree list', async () => {
    const { useStartupAgentSessionRecovery } = await loadHook();

    useStartupAgentSessionRecovery({
      selectedRepo: '/repo',
      activeWorktree: makeWorktree('/repo/.worktrees/stale'),
      selectedRepoCanLoad: true,
      worktreesFetched: true,
      worktreesFetching: false,
      availableWorktreePaths: ['/repo', '/repo/.worktrees/feature-a'],
    });

    expect(restoreWorktreeAgentSessions).not.toHaveBeenCalled();
  });

  it('skips prewarm for temporary repositories and unloadable selections', async () => {
    const { useStartupAgentSessionRecovery } = await loadHook();
    const activeWorktree = makeWorktree('/tmp/worktree');

    useStartupAgentSessionRecovery({
      selectedRepo: TEMP_REPO_ID,
      activeWorktree,
      selectedRepoCanLoad: true,
      worktreesFetched: true,
      worktreesFetching: false,
      availableWorktreePaths: ['/tmp/worktree'],
    });

    useStartupAgentSessionRecovery({
      selectedRepo: '/repo',
      activeWorktree,
      selectedRepoCanLoad: false,
      worktreesFetched: true,
      worktreesFetching: false,
      availableWorktreePaths: ['/tmp/worktree'],
    });

    expect(restoreWorktreeAgentSessions).not.toHaveBeenCalled();
  });
});
