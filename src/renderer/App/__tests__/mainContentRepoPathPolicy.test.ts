import type { GitWorktree } from '@shared/types';
import { describe, expect, it } from 'vitest';
import { resolveMainContentRepoPath } from '../mainContentRepoPathPolicy';

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

describe('mainContentRepoPathPolicy', () => {
  it('uses the main worktree as the session repository identity when a linked worktree is selected as a repository', () => {
    const mainWorktree = {
      ...makeWorktree('/repo/main'),
      isMainWorktree: true,
    };
    const selectedWorktree = makeWorktree('/repo/worktrees/feature');

    expect(
      resolveMainContentRepoPath({
        selectedRepo: selectedWorktree.path,
        activeWorktree: selectedWorktree,
        selectedRepoWorktrees: [mainWorktree, selectedWorktree],
        repoWorktreeMap: {
          [selectedWorktree.path]: selectedWorktree.path,
        },
      })
    ).toBe(mainWorktree.path);
  });

  it('keeps the retained worktree bound to its original repo while the next repo is still loading', () => {
    expect(
      resolveMainContentRepoPath({
        selectedRepo: '/repo-b',
        activeWorktree: makeWorktree('/repo-a/worktrees/feature-a'),
        selectedRepoWorktrees: [],
        repoWorktreeMap: {
          '/repo-a': '/repo-a/worktrees/feature-a',
          '/repo-b': '/repo-b/worktrees/feature-b',
        },
      })
    ).toBe('/repo-a');
  });

  it('prefers the selected repo once the active worktree belongs to the selected repo snapshot', () => {
    const selectedRepoWorktree = makeWorktree('/repo-b/worktrees/feature-b');

    expect(
      resolveMainContentRepoPath({
        selectedRepo: '/repo-b',
        activeWorktree: selectedRepoWorktree,
        selectedRepoWorktrees: [selectedRepoWorktree],
        repoWorktreeMap: {
          '/repo-a': '/repo-a/worktrees/feature-a',
          '/repo-b': '/repo-b/worktrees/feature-b',
        },
      })
    ).toBe('/repo-b');
  });
});
