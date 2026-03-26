import type { GitWorktree } from '@shared/types';
import { describe, expect, it } from 'vitest';
import { resolvePreferredWorktreeSelection } from '../worktreeSelectionPolicy';

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

describe('worktreeSelectionPolicy', () => {
  it('returns the main worktree when available', () => {
    const result = resolvePreferredWorktreeSelection('/repo', [
      makeWorktree({ path: '/repo/worktrees/feature' }),
      makeWorktree({ path: '/repo', isMainWorktree: true }),
    ]);

    expect(result?.path).toBe('/repo');
  });

  it('falls back to the worktree whose path matches the selected repo', () => {
    const result = resolvePreferredWorktreeSelection('/repo', [
      makeWorktree({ path: '/repo', isMainWorktree: false }),
      makeWorktree({ path: '/repo/worktrees/feature' }),
    ]);

    expect(result?.path).toBe('/repo');
  });

  it('falls back to the first worktree when no better match exists', () => {
    const result = resolvePreferredWorktreeSelection('/repo', [
      makeWorktree({ path: '/repo/worktrees/feature-a' }),
      makeWorktree({ path: '/repo/worktrees/feature-b' }),
    ]);

    expect(result?.path).toBe('/repo/worktrees/feature-a');
  });

  it('returns null when no repo or worktrees are available', () => {
    expect(resolvePreferredWorktreeSelection(null, [])).toBeNull();
  });
});
