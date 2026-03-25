import { describe, expect, it } from 'vitest';
import { shouldRefreshFileTreeOnWatchResume, shouldWatchFileTree } from '../fileTreeWatchPolicy';

describe('fileTreeWatchPolicy', () => {
  it('only watches when rootPath is available and the file tab is active', () => {
    expect(
      shouldWatchFileTree({
        rootPath: '/repo',
        enabled: true,
        isActive: true,
        shouldPoll: true,
      })
    ).toBe(true);

    expect(
      shouldWatchFileTree({
        rootPath: '/repo',
        enabled: true,
        isActive: false,
        shouldPoll: true,
      })
    ).toBe(false);
  });

  it('stops watching while the window is idle', () => {
    expect(
      shouldWatchFileTree({
        rootPath: '/repo',
        enabled: true,
        isActive: true,
        shouldPoll: false,
      })
    ).toBe(false);
  });

  it('refreshes when watching resumes for the same root path', () => {
    expect(
      shouldRefreshFileTreeOnWatchResume(
        { rootPath: '/repo', shouldWatch: false },
        { rootPath: '/repo', shouldWatch: true }
      )
    ).toBe(true);
  });

  it('does not refresh when switching to a different root path', () => {
    expect(
      shouldRefreshFileTreeOnWatchResume(
        { rootPath: '/repo-a', shouldWatch: false },
        { rootPath: '/repo-b', shouldWatch: true }
      )
    ).toBe(false);
  });
});
