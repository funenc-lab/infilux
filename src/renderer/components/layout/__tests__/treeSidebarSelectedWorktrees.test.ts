import type { GitWorktree } from '@shared/types';
import { describe, expect, it } from 'vitest';
import { resolveTreeSidebarSelectedWorktrees } from '../treeSidebarSelectedWorktrees';

function makeWorktree(overrides: Partial<GitWorktree>): GitWorktree {
  return {
    path: '/repo',
    head: 'abc123',
    branch: 'main',
    isMainWorktree: false,
    isLocked: false,
    prunable: false,
    ...overrides,
  };
}

describe('resolveTreeSidebarSelectedWorktrees', () => {
  it('prefers the fetched selected repository worktrees when available', () => {
    const fetchedWorktrees = [
      makeWorktree({ path: '/repo' }),
      makeWorktree({ path: '/repo/.worktrees/feature-a', branch: 'feature-a' }),
    ];

    expect(
      resolveTreeSidebarSelectedWorktrees({
        worktrees: fetchedWorktrees,
        cachedWorktrees: [makeWorktree({ path: '/repo/.worktrees/stale', branch: 'stale' })],
      })
    ).toEqual(fetchedWorktrees);
  });

  it('falls back to the cached selected repository snapshot when the fetched list is empty', () => {
    const cachedWorktrees = [
      makeWorktree({ path: '/repo' }),
      makeWorktree({ path: '/repo/.worktrees/feature-a', branch: 'feature-a' }),
    ];

    expect(
      resolveTreeSidebarSelectedWorktrees({
        worktrees: [],
        cachedWorktrees,
      })
    ).toEqual(cachedWorktrees);
  });

  it('returns an empty list when there is no fetched or cached repository snapshot yet', () => {
    expect(
      resolveTreeSidebarSelectedWorktrees({
        worktrees: [],
        cachedWorktrees: [],
      })
    ).toEqual([]);
  });
});
