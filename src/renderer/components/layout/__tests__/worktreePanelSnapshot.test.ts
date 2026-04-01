import type { GitWorktree } from '@shared/types';
import { describe, expect, it } from 'vitest';
import { resolveWorktreePanelSnapshot } from '../worktreePanelSnapshot';

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

describe('resolveWorktreePanelSnapshot', () => {
  it('keeps the active worktree visible while the selected repository list is transiently empty', () => {
    const activeWorktree = makeWorktree({ path: '/repo-b/.worktrees/feature-b' });

    expect(
      resolveWorktreePanelSnapshot({
        worktrees: [],
        cachedWorktrees: [],
        activeWorktree,
      })
    ).toEqual([activeWorktree]);
  });

  it('does not duplicate the active worktree when the fetched list already contains it', () => {
    const fetchedWorktree = makeWorktree({ path: '/repo-b/.worktrees/feature-b' });

    expect(
      resolveWorktreePanelSnapshot({
        worktrees: [fetchedWorktree],
        cachedWorktrees: [],
        activeWorktree: fetchedWorktree,
      })
    ).toEqual([fetchedWorktree]);
  });

  it('prefers the cached repository snapshot over a path-only active placeholder', () => {
    const cachedWorktree = makeWorktree({
      path: '/repo-b/.worktrees/feature-b',
      branch: 'feature-b',
      head: 'def456',
    });

    expect(
      resolveWorktreePanelSnapshot({
        worktrees: [],
        cachedWorktrees: [cachedWorktree],
        activeWorktree: { path: '/repo-b/.worktrees/feature-b' } as GitWorktree,
      })
    ).toEqual([cachedWorktree]);
  });

  it('ignores a path-only active placeholder when no complete snapshot is available yet', () => {
    expect(
      resolveWorktreePanelSnapshot({
        worktrees: [],
        cachedWorktrees: [],
        activeWorktree: { path: '/repo-b/.worktrees/feature-b' } as GitWorktree,
      })
    ).toEqual([]);
  });
});
