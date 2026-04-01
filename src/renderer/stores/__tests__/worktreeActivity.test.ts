import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('worktree activity store', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.stubGlobal('window', {
      electronAPI: {
        git: {
          getDiffStats: vi.fn(async () => ({ insertions: 3, deletions: 1 })),
        },
        worktree: {
          activate: vi.fn(),
        },
      },
    });
  });

  it('does not rewrite activity state when agent count is unchanged', async () => {
    const { useWorktreeActivityStore } = await import('../worktreeActivity');
    const store = useWorktreeActivityStore.getState();

    store.setAgentCount('/repo', 2);
    const previousActivities = useWorktreeActivityStore.getState().activities;

    store.setAgentCount('/repo', 2);

    expect(useWorktreeActivityStore.getState().activities).toBe(previousActivities);
  });

  it('does not rewrite activity state when terminal count is unchanged', async () => {
    const { useWorktreeActivityStore } = await import('../worktreeActivity');
    const store = useWorktreeActivityStore.getState();

    store.setTerminalCount('/repo', 3);
    const previousActivities = useWorktreeActivityStore.getState().activities;

    store.setTerminalCount('/repo', 3);

    expect(useWorktreeActivityStore.getState().activities).toBe(previousActivities);
  });

  it('does not rewrite diff stats when fetched values are unchanged', async () => {
    const { useWorktreeActivityStore } = await import('../worktreeActivity');
    const store = useWorktreeActivityStore.getState();

    await store.fetchDiffStats(['/repo']);
    const previousDiffStats = useWorktreeActivityStore.getState().diffStats;

    await store.fetchDiffStats(['/repo']);

    expect(useWorktreeActivityStore.getState().diffStats).toBe(previousDiffStats);
  });

  it('deduplicates concurrent diff stat fetches for the same worktree path', async () => {
    const getDiffStats = vi.fn(
      () =>
        new Promise<{ insertions: number; deletions: number }>((resolve) => {
          setTimeout(() => resolve({ insertions: 5, deletions: 2 }), 5);
        })
    );
    vi.stubGlobal('window', {
      electronAPI: {
        git: {
          getDiffStats,
        },
        worktree: {
          activate: vi.fn(),
        },
      },
    });

    const { useWorktreeActivityStore } = await import('../worktreeActivity');
    const store = useWorktreeActivityStore.getState();

    await Promise.all([store.fetchDiffStats(['/repo']), store.fetchDiffStats(['/repo'])]);

    expect(getDiffStats).toHaveBeenCalledTimes(1);
    expect(useWorktreeActivityStore.getState().diffStats['/repo']).toEqual({
      insertions: 5,
      deletions: 2,
    });
  });

  it('skips immediate refetches inside the diff stat freshness window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-31T00:00:00.000Z'));

    const getDiffStats = vi.fn(async () => ({ insertions: 7, deletions: 4 }));
    vi.stubGlobal('window', {
      electronAPI: {
        git: {
          getDiffStats,
        },
        worktree: {
          activate: vi.fn(),
        },
      },
    });

    const { useWorktreeActivityStore, DIFF_STATS_FRESHNESS_MS } = await import(
      '../worktreeActivity'
    );
    const store = useWorktreeActivityStore.getState();

    await store.fetchDiffStats(['/repo']);
    await store.fetchDiffStats(['/repo']);

    expect(getDiffStats).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(DIFF_STATS_FRESHNESS_MS + 1);
    vi.setSystemTime(Date.now());

    await store.fetchDiffStats(['/repo']);

    expect(getDiffStats).toHaveBeenCalledTimes(2);
  });
});
