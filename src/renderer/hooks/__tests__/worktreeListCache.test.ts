import type { GitWorktree } from '@shared/types';
import { describe, expect, it } from 'vitest';
import { buildWorktreeListMap, resolveWorktreeListSnapshot } from '../worktreeListCache';

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

describe('buildWorktreeListMap', () => {
  it('maps plain worktree array data by repository path', () => {
    expect(
      buildWorktreeListMap(
        [
          { repoPath: '/repo-a', enabled: true },
          { repoPath: '/repo-b', enabled: true },
        ],
        [
          [makeWorktree({ path: '/repo-a', isMainWorktree: true })],
          [
            makeWorktree({ path: '/repo-b', isMainWorktree: true }),
            makeWorktree({ path: '/repo-b/.worktrees/feature-b', branch: 'feature-b' }),
          ],
        ]
      )
    ).toEqual({
      '/repo-a': [makeWorktree({ path: '/repo-a', isMainWorktree: true })],
      '/repo-b': [
        makeWorktree({ path: '/repo-b', isMainWorktree: true }),
        makeWorktree({ path: '/repo-b/.worktrees/feature-b', branch: 'feature-b' }),
      ],
    });
  });

  it('ignores disabled repositories and sanitizes non-worktree entries', () => {
    expect(
      buildWorktreeListMap(
        [
          { repoPath: '/repo-a', enabled: false },
          { repoPath: '/repo-b', enabled: true },
        ],
        [
          [makeWorktree({ path: '/repo-a' })],
          [null, undefined, makeWorktree({ path: '/repo-b', isMainWorktree: true })],
        ]
      )
    ).toEqual({
      '/repo-b': [makeWorktree({ path: '/repo-b', isMainWorktree: true })],
    });
  });

  it('preserves the previous repository snapshot while the next fetch has no array payload yet', () => {
    expect(
      buildWorktreeListMap([{ repoPath: '/repo-a', enabled: true }], [undefined], {
        '/repo-a': [makeWorktree({ path: '/repo-a/.worktrees/feature-a', branch: 'feature-a' })],
      })
    ).toEqual({
      '/repo-a': [makeWorktree({ path: '/repo-a/.worktrees/feature-a', branch: 'feature-a' })],
    });
  });

  it('preserves the previous repository snapshot when a refresh unexpectedly returns an empty array', () => {
    expect(
      buildWorktreeListMap([{ repoPath: '/repo-a', enabled: true }], [[]], {
        '/repo-a': [makeWorktree({ path: '/repo-a/.worktrees/feature-a', branch: 'feature-a' })],
      })
    ).toEqual({
      '/repo-a': [makeWorktree({ path: '/repo-a/.worktrees/feature-a', branch: 'feature-a' })],
    });
  });
});

describe('resolveWorktreeListSnapshot', () => {
  it('marks empty array recovery when a previous healthy snapshot exists', () => {
    expect(
      resolveWorktreeListSnapshot(
        [],
        [makeWorktree({ path: '/repo-a/.worktrees/feature-a', branch: 'feature-a' })]
      )
    ).toEqual({
      worktrees: [makeWorktree({ path: '/repo-a/.worktrees/feature-a', branch: 'feature-a' })],
      recoveryReason: 'empty',
    });
  });
});
