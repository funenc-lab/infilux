import { describe, expect, it, vi } from 'vitest';
import {
  createDiffStatsSchedule,
  deriveDiffStatsScope,
  mergeDiffStatsScopes,
} from '../worktreeDiffStatsSchedule';

describe('deriveDiffStatsScope', () => {
  it('excludes hidden paths while prioritizing selected and live visible worktrees', () => {
    expect(
      deriveDiffStatsScope({
        collapsed: false,
        selectedPath: '/repo/selected',
        livePaths: ['/repo/live', '/repo/hidden'],
        visiblePaths: ['/repo/visible', '/repo/live', '/repo/selected'],
      })
    ).toEqual(['/repo/selected', '/repo/live', '/repo/visible']);
  });

  it('prioritizes selected and live paths across independently registered scopes', () => {
    expect(
      mergeDiffStatsScopes([
        {
          collapsed: false,
          enabled: true,
          livePaths: [],
          visiblePaths: ['/repo/visible'],
        },
        {
          collapsed: false,
          enabled: true,
          selectedPath: '/repo/selected',
          livePaths: [],
          visiblePaths: ['/repo/selected'],
        },
        {
          collapsed: false,
          enabled: true,
          livePaths: ['/repo/live'],
          visiblePaths: ['/repo/live'],
        },
        {
          collapsed: false,
          enabled: false,
          selectedPath: '/repo/disabled',
          livePaths: [],
          visiblePaths: ['/repo/disabled'],
        },
      ])
    ).toEqual(['/repo/selected', '/repo/live', '/repo/visible']);
  });
});

describe('createDiffStatsSchedule', () => {
  it('starts at most three new path requests in each ten second budget window', async () => {
    let now = 0;
    const fetchPath = vi.fn().mockResolvedValue(undefined);
    const schedule = createDiffStatsSchedule({
      fetchPath,
      getScope: () => ['/repo/a', '/repo/b', '/repo/c', '/repo/d'],
      now: () => now,
      setTimer: () => 0 as unknown as ReturnType<typeof setInterval>,
      clearTimer: () => undefined,
    });

    await schedule.refresh();
    expect(fetchPath).toHaveBeenCalledTimes(3);

    now = 10_000;
    await schedule.refresh();
    expect(fetchPath).toHaveBeenCalledTimes(6);
  });

  it('does not start a duplicate request while the same path is in flight', async () => {
    let resolveRequest: (() => void) | undefined;
    const fetchPath = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRequest = resolve;
        })
    );
    const schedule = createDiffStatsSchedule({
      fetchPath,
      getScope: () => ['/repo/a'],
      setTimer: () => 0 as unknown as ReturnType<typeof setInterval>,
      clearTimer: () => undefined,
    });

    const firstRefresh = schedule.refresh();
    await Promise.resolve();
    await schedule.refresh();
    expect(fetchPath).toHaveBeenCalledTimes(1);

    resolveRequest?.();
    await firstRefresh;
  });

  it('rotates through scope after exhausting a budget window', async () => {
    let now = 0;
    const fetchPath = vi.fn().mockResolvedValue(undefined);
    const schedule = createDiffStatsSchedule({
      fetchPath,
      getScope: () => ['/repo/a', '/repo/b', '/repo/c', '/repo/d'],
      now: () => now,
      setTimer: () => 0 as unknown as ReturnType<typeof setInterval>,
      clearTimer: () => undefined,
    });

    await schedule.refresh();
    now = 10_000;
    await schedule.refresh();

    expect(fetchPath.mock.calls.slice(3).map(([path]) => path)).toContain('/repo/d');
  });

  it('creates one timer and deduplicates a path shared by two registered scopes', async () => {
    const setTimer = vi.fn(() => 1 as unknown as ReturnType<typeof setInterval>);
    const fetchPath = vi.fn().mockResolvedValue(undefined);
    const schedule = createDiffStatsSchedule({
      fetchPath,
      getScope: () => ['/repo/selected', '/repo/selected', '/repo/visible'],
      setTimer,
      clearTimer: () => undefined,
    });

    schedule.start();
    schedule.start();
    await Promise.resolve();

    expect(setTimer).toHaveBeenCalledTimes(1);
    expect(fetchPath).toHaveBeenCalledTimes(2);
  });

  it('defers invalidation until an in-flight request settles without duplicating it', async () => {
    let resolveRequest: (() => void) | undefined;
    const fetchPath = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRequest = resolve;
        })
    );
    const schedule = createDiffStatsSchedule({
      fetchPath,
      getScope: () => ['/repo/a'],
      setTimer: () => 0 as unknown as ReturnType<typeof setInterval>,
      clearTimer: () => undefined,
    });

    const pending = schedule.refresh();
    await Promise.resolve();
    schedule.invalidate('/repo/a');
    await schedule.refresh();
    expect(fetchPath).toHaveBeenCalledTimes(1);

    resolveRequest?.();
    await pending;
    await Promise.resolve();
    expect(fetchPath).toHaveBeenCalledTimes(2);
  });
});
