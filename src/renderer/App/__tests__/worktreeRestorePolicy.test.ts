import type { GitWorktree } from '@shared/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { shouldPruneSavedWorktreePath } from '../worktreeRestorePolicy';

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

describe('worktreeRestorePolicy', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not prune the saved worktree path while the refresh is still unstable', () => {
    expect(
      shouldPruneSavedWorktreePath({
        savedWorktreePath: '/repo/.worktrees/feature-a',
        worktrees: [],
        worktreesFetched: false,
        worktreesFetching: false,
        hasWorktreeError: false,
      })
    ).toBe(false);

    expect(
      shouldPruneSavedWorktreePath({
        savedWorktreePath: '/repo/.worktrees/feature-a',
        worktrees: [],
        worktreesFetched: true,
        worktreesFetching: true,
        hasWorktreeError: false,
      })
    ).toBe(false);
  });

  it('does not prune the saved worktree path when the latest refresh failed', () => {
    expect(
      shouldPruneSavedWorktreePath({
        savedWorktreePath: '/repo/.worktrees/feature-a',
        worktrees: [],
        worktreesFetched: true,
        worktreesFetching: false,
        hasWorktreeError: true,
      })
    ).toBe(false);
  });

  it('does not prune the saved worktree path when the fetched list still contains the exact path', () => {
    expect(
      shouldPruneSavedWorktreePath({
        savedWorktreePath: '/repo/.worktrees/feature-a',
        worktrees: [makeWorktree({ path: '/repo/.worktrees/feature-a' })],
        worktreesFetched: true,
        worktreesFetching: false,
        hasWorktreeError: false,
      })
    ).toBe(false);
  });

  it('does not prune equivalent worktree paths when macOS normalization keeps them matched', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' });

    expect(
      shouldPruneSavedWorktreePath({
        savedWorktreePath: '/Repo/.worktrees/Feature-A',
        worktrees: [makeWorktree({ path: '/repo/.worktrees/feature-a' })],
        worktreesFetched: true,
        worktreesFetching: false,
        hasWorktreeError: false,
      })
    ).toBe(false);
  });

  it('prunes differently cased worktree paths under linux normalization rules', () => {
    vi.stubGlobal('navigator', { platform: 'Linux x86_64' });

    expect(
      shouldPruneSavedWorktreePath({
        savedWorktreePath: '/Repo/.worktrees/Feature-A',
        worktrees: [makeWorktree({ path: '/repo/.worktrees/feature-a' })],
        worktreesFetched: true,
        worktreesFetching: false,
        hasWorktreeError: false,
      })
    ).toBe(true);
  });

  it('prunes the saved worktree path only after a stable successful refresh excludes it', () => {
    expect(
      shouldPruneSavedWorktreePath({
        savedWorktreePath: '/repo/.worktrees/feature-a',
        worktrees: [makeWorktree({ path: '/repo' })],
        worktreesFetched: true,
        worktreesFetching: false,
        hasWorktreeError: false,
      })
    ).toBe(true);
  });
});
