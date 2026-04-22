import { describe, expect, it } from 'vitest';
import {
  FILE_TREE_TAB_REACTIVATION_REFRESH_THRESHOLD_MS,
  type FileTreeWatchStateSnapshot,
  shouldRefreshFileTreeOnWatchResume,
  shouldWatchFileTree,
} from '../fileTreeWatchPolicy';

function createWatchStateSnapshot(
  overrides: Partial<FileTreeWatchStateSnapshot>
): FileTreeWatchStateSnapshot {
  return {
    rootPath: '/repo',
    shouldWatch: false,
    isActive: true,
    shouldPoll: true,
    updatedAt: 0,
    ...overrides,
  };
}

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
        createWatchStateSnapshot({
          rootPath: '/repo',
          shouldWatch: false,
          shouldPoll: false,
          updatedAt: 100,
        }),
        createWatchStateSnapshot({
          rootPath: '/repo',
          shouldWatch: true,
          shouldPoll: true,
          updatedAt: 200,
        })
      )
    ).toBe(true);
  });

  it('does not refresh when switching to a different root path', () => {
    expect(
      shouldRefreshFileTreeOnWatchResume(
        createWatchStateSnapshot({
          rootPath: '/repo-a',
          shouldWatch: false,
          shouldPoll: false,
          updatedAt: 100,
        }),
        createWatchStateSnapshot({
          rootPath: '/repo-b',
          shouldWatch: true,
          shouldPoll: true,
          updatedAt: 200,
        })
      )
    ).toBe(false);
  });

  it('skips refresh for rapid file tab reactivation', () => {
    expect(
      shouldRefreshFileTreeOnWatchResume(
        createWatchStateSnapshot({
          rootPath: '/repo',
          shouldWatch: false,
          isActive: false,
          shouldPoll: true,
          updatedAt: 100,
        }),
        createWatchStateSnapshot({
          rootPath: '/repo',
          shouldWatch: true,
          isActive: true,
          shouldPoll: true,
          updatedAt: 100 + FILE_TREE_TAB_REACTIVATION_REFRESH_THRESHOLD_MS - 1,
        })
      )
    ).toBe(false);
  });

  it('refreshes when the file tab resumes after the threshold', () => {
    expect(
      shouldRefreshFileTreeOnWatchResume(
        createWatchStateSnapshot({
          rootPath: '/repo',
          shouldWatch: false,
          isActive: false,
          shouldPoll: true,
          updatedAt: 100,
        }),
        createWatchStateSnapshot({
          rootPath: '/repo',
          shouldWatch: true,
          isActive: true,
          shouldPoll: true,
          updatedAt: 100 + FILE_TREE_TAB_REACTIVATION_REFRESH_THRESHOLD_MS,
        })
      )
    ).toBe(true);
  });

  it('does not refresh for non-polling, non-tab-resume transitions', () => {
    expect(
      shouldRefreshFileTreeOnWatchResume(
        createWatchStateSnapshot({
          rootPath: '/repo',
          shouldWatch: false,
          isActive: true,
          shouldPoll: true,
          updatedAt: 100,
        }),
        createWatchStateSnapshot({
          rootPath: '/repo',
          shouldWatch: true,
          isActive: true,
          shouldPoll: true,
          updatedAt: 200,
        })
      )
    ).toBe(false);
  });
});
