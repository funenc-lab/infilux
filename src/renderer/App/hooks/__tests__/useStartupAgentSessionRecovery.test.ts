import type { GitWorktree } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEMP_REPO_ID } from '../../constants';

const restoreWorktreeAgentSessions = vi.fn(() => Promise.resolve([]));
const restoreWorktreeSessions = vi.fn(() => Promise.resolve({ items: [] }));
const getWorktreeAgentSessionRecoveryStatus = vi.fn(() => 'idle');
const getSessions = vi.fn((): Array<{ id: string; repoPath: string; cwd: string }> => []);
const upsertRecoveredSession = vi.fn();
const updateGroupState = vi.fn();

vi.mock('@/components/chat/agentSessionRecovery', () => ({
  restoreWorktreeAgentSessions,
  getWorktreeAgentSessionRecoveryStatus,
}));

vi.mock('@/stores/agentSessions', () => ({
  useAgentSessionsStore: (
    selector: (state: {
      getSessions: typeof getSessions;
      upsertRecoveredSession: typeof upsertRecoveredSession;
      updateGroupState: typeof updateGroupState;
    }) => unknown
  ) =>
    selector({
      getSessions,
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
    getWorktreeAgentSessionRecoveryStatus.mockReset();
    getWorktreeAgentSessionRecoveryStatus.mockReturnValue('idle');
    getSessions.mockReset();
    getSessions.mockReturnValue([]);
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

  it('uses the main worktree identity when a linked worktree is selected as a repository', async () => {
    const { useStartupAgentSessionRecovery } = await loadHook();
    const mainWorktree = {
      ...makeWorktree('/repo/main'),
      isMainWorktree: true,
    };
    const activeWorktree = makeWorktree('/repo/worktrees/feature-a');

    useStartupAgentSessionRecovery({
      selectedRepo: activeWorktree.path,
      activeWorktree,
      selectedRepoCanLoad: true,
      worktreesFetched: true,
      worktreesFetching: false,
      availableWorktreePaths: [mainWorktree.path, activeWorktree.path],
      selectedRepoWorktrees: [mainWorktree, activeWorktree],
    });

    expect(restoreWorktreeAgentSessions).toHaveBeenCalledWith({
      repoPath: mainWorktree.path,
      cwd: activeWorktree.path,
      restoreWorktreeSessions,
      upsertRecoveredSession,
      updateGroupState,
    });
  });

  it('still prewarms when the startup worktree only has renderer-hydrated sessions in memory', async () => {
    getSessions.mockReturnValue([
      {
        id: 'session-1',
        repoPath: '/repo',
        cwd: '/repo/.worktrees/feature-a',
      },
    ]);
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

    expect(getWorktreeAgentSessionRecoveryStatus).toHaveBeenCalledWith(
      '/repo',
      '/repo/.worktrees/feature-a'
    );
    expect(restoreWorktreeAgentSessions).toHaveBeenCalledWith({
      repoPath: '/repo',
      cwd: '/repo/.worktrees/feature-a',
      restoreWorktreeSessions,
      upsertRecoveredSession,
      updateGroupState,
    });
  });

  it('skips prewarm after the startup worktree already completed coordinated recovery', async () => {
    getSessions.mockReturnValue([
      {
        id: 'session-1',
        repoPath: '/repo',
        cwd: '/repo/.worktrees/feature-a',
      },
    ]);
    getWorktreeAgentSessionRecoveryStatus.mockReturnValue('settled');
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

    expect(restoreWorktreeAgentSessions).not.toHaveBeenCalled();
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
