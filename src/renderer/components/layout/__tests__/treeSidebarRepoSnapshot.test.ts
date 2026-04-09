import type { GitWorktree } from '@shared/types';
import { describe, expect, it } from 'vitest';
import { resolveTreeSidebarRepoSnapshot } from '../treeSidebarRepoSnapshot';

const selectedWorktrees: GitWorktree[] = [
  {
    path: '/repo-a',
    head: 'abc123',
    branch: 'main',
    isMainWorktree: true,
    isLocked: false,
    prunable: false,
  },
];

describe('resolveTreeSidebarRepoSnapshot', () => {
  it('prefers selected repository worktrees over the expanded repo cache', () => {
    const snapshot = resolveTreeSidebarRepoSnapshot({
      repoPath: '/repo-a',
      selectedRepo: '/repo-a',
      selectedWorktrees,
      selectedIsLoading: false,
      selectedError: null,
      worktreesMap: {},
      loadingMap: {},
      errorsMap: {},
      isExpanded: true,
      canLoad: true,
    });

    expect(snapshot.worktrees).toEqual(selectedWorktrees);
    expect(snapshot.isLoading).toBe(false);
    expect(snapshot.error).toBeNull();
  });

  it('uses expanded repo cache for non-selected repositories', () => {
    const snapshot = resolveTreeSidebarRepoSnapshot({
      repoPath: '/repo-b',
      selectedRepo: '/repo-a',
      selectedWorktrees,
      selectedIsLoading: false,
      selectedError: null,
      worktreesMap: {
        '/repo-b': [
          {
            path: '/repo-b/.worktrees/feature-a',
            head: 'def456',
            branch: 'feature-a',
            isMainWorktree: false,
            isLocked: false,
            prunable: false,
          },
        ],
      },
      loadingMap: {
        '/repo-b': false,
      },
      errorsMap: {
        '/repo-b': null,
      },
      isExpanded: true,
      canLoad: true,
    });

    expect(snapshot.worktrees).toEqual([
      {
        path: '/repo-b/.worktrees/feature-a',
        head: 'def456',
        branch: 'feature-a',
        isMainWorktree: false,
        isLocked: false,
        prunable: false,
      },
    ]);
    expect(snapshot.isLoading).toBe(false);
    expect(snapshot.error).toBeNull();
  });

  it('keeps showing expanded repo cache without re-entering loading while the selected repository is refetching', () => {
    const expandedWorktrees: GitWorktree[] = [
      {
        path: '/repo-a',
        head: 'abc123',
        branch: 'main',
        isMainWorktree: true,
        isLocked: false,
        prunable: false,
      },
    ];

    const snapshot = resolveTreeSidebarRepoSnapshot({
      repoPath: '/repo-a',
      selectedRepo: '/repo-a',
      selectedWorktrees: [],
      selectedIsLoading: false,
      selectedIsFetching: true,
      selectedError: null,
      worktreesMap: {
        '/repo-a': expandedWorktrees,
      },
      loadingMap: {},
      errorsMap: {},
      isExpanded: true,
      canLoad: true,
    });

    expect(snapshot.worktrees).toEqual(expandedWorktrees);
    expect(snapshot.isLoading).toBe(false);
    expect(snapshot.error).toBeNull();
  });

  it('falls back to expanded repo cache when the selected repository snapshot is transiently empty', () => {
    const expandedWorktrees: GitWorktree[] = [
      {
        path: '/repo-a',
        head: 'abc123',
        branch: 'main',
        isMainWorktree: true,
        isLocked: false,
        prunable: false,
      },
    ];

    const snapshot = resolveTreeSidebarRepoSnapshot({
      repoPath: '/repo-a',
      selectedRepo: '/repo-a',
      selectedWorktrees: [],
      selectedIsLoading: false,
      selectedIsFetching: false,
      selectedError: null,
      worktreesMap: {
        '/repo-a': expandedWorktrees,
      },
      loadingMap: {},
      errorsMap: {},
      isExpanded: true,
      canLoad: true,
    });

    expect(snapshot.worktrees).toEqual(expandedWorktrees);
    expect(snapshot.isLoading).toBe(false);
    expect(snapshot.error).toBeNull();
  });

  it('prefers expanded repo cache when the selected snapshot still points at another repository', () => {
    const expandedWorktrees: GitWorktree[] = [
      {
        path: '/repo-b/.worktrees/feature-b',
        head: 'ghi789',
        branch: 'feature-b',
        isMainWorktree: false,
        isLocked: false,
        prunable: false,
      },
    ];

    const snapshot = resolveTreeSidebarRepoSnapshot({
      repoPath: '/repo-b',
      selectedRepo: '/repo-b',
      selectedWorktrees: selectedWorktrees,
      selectedActiveWorktreePath: '/repo-b/.worktrees/feature-b',
      selectedIsLoading: false,
      selectedIsFetching: false,
      selectedError: null,
      worktreesMap: {
        '/repo-b': expandedWorktrees,
      },
      loadingMap: {},
      errorsMap: {},
      isExpanded: true,
      canLoad: true,
    });

    expect(snapshot.worktrees).toEqual(expandedWorktrees);
    expect(snapshot.isLoading).toBe(false);
    expect(snapshot.error).toBeNull();
  });

  it('prefers the expanded repo cache when it is a strict superset of the selected snapshot', () => {
    const expandedWorktrees: GitWorktree[] = [
      {
        path: '/repo-b',
        head: 'base123',
        branch: 'main',
        isMainWorktree: true,
        isLocked: false,
        prunable: false,
      },
      {
        path: '/repo-b/.worktrees/feature-b',
        head: 'ghi789',
        branch: 'feature-b',
        isMainWorktree: false,
        isLocked: false,
        prunable: false,
      },
    ];

    const snapshot = resolveTreeSidebarRepoSnapshot({
      repoPath: '/repo-b',
      selectedRepo: '/repo-b',
      selectedWorktrees: [expandedWorktrees[1]!],
      selectedActiveWorktreePath: '/repo-b/.worktrees/feature-b',
      selectedIsLoading: false,
      selectedIsFetching: false,
      selectedError: null,
      worktreesMap: {
        '/repo-b': expandedWorktrees,
      },
      loadingMap: {},
      errorsMap: {},
      isExpanded: true,
      canLoad: true,
    });

    expect(snapshot.worktrees).toEqual(expandedWorktrees);
    expect(snapshot.isLoading).toBe(false);
    expect(snapshot.error).toBeNull();
  });

  it('keeps the active worktree visible while the selected repository snapshot is switching', () => {
    const activeWorktree: GitWorktree = {
      path: '/repo-b/.worktrees/feature-b',
      head: 'ghi789',
      branch: 'feature-b',
      isMainWorktree: false,
      isLocked: false,
      prunable: false,
    };

    const snapshot = resolveTreeSidebarRepoSnapshot({
      repoPath: '/repo-b',
      selectedRepo: '/repo-b',
      selectedWorktrees: [],
      selectedActiveWorktree: activeWorktree,
      selectedActiveWorktreePath: activeWorktree.path,
      selectedIsLoading: false,
      selectedIsFetching: false,
      selectedError: null,
      worktreesMap: {},
      loadingMap: {},
      errorsMap: {},
      isExpanded: true,
      canLoad: true,
    });

    expect(snapshot.worktrees).toEqual([activeWorktree]);
    expect(snapshot.isLoading).toBe(true);
    expect(snapshot.error).toBeNull();
  });
});
