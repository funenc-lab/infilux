import type { GitWorktree } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveWorktreeSyncAction } from '../worktreeSwitchPolicy';

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

describe('worktreeSwitchPolicy', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retains the active worktree while the next repository has not fetched yet', () => {
    const activeWorktree = makeWorktree({ path: '/repo-b/.worktrees/feature-b' });

    expect(
      resolveWorktreeSyncAction({
        worktrees: [],
        activeWorktree,
        selectedRepoCanLoad: true,
        worktreesFetched: false,
        worktreesFetching: false,
        hasWorktreeError: false,
      })
    ).toEqual({ type: 'retain' });
  });

  it('retains the active worktree while the next repository is still fetching', () => {
    const activeWorktree = makeWorktree({ path: '/repo-b/.worktrees/feature-b' });

    expect(
      resolveWorktreeSyncAction({
        worktrees: [],
        activeWorktree,
        selectedRepoCanLoad: true,
        worktreesFetched: true,
        worktreesFetching: true,
        hasWorktreeError: false,
      })
    ).toEqual({ type: 'retain' });
  });

  it('retains the active worktree when the selected repository snapshot is transiently empty without an error', () => {
    const activeWorktree = makeWorktree({ path: '/repo-b/.worktrees/feature-b' });

    expect(
      resolveWorktreeSyncAction({
        worktrees: [],
        activeWorktree,
        selectedRepoCanLoad: true,
        worktreesFetched: true,
        worktreesFetching: false,
        hasWorktreeError: false,
      })
    ).toEqual({ type: 'retain' });
  });

  it('replaces the active worktree with the canonical fetched entry when it becomes available', () => {
    const activeWorktree = makeWorktree({ path: '/repo-b/.worktrees/feature-b' });
    const fetchedWorktree = makeWorktree({
      path: '/repo-b/.worktrees/feature-b',
      head: 'def456',
      branch: 'feature-b',
    });

    expect(
      resolveWorktreeSyncAction({
        worktrees: [fetchedWorktree],
        activeWorktree,
        selectedRepoCanLoad: true,
        worktreesFetched: true,
        worktreesFetching: false,
        hasWorktreeError: false,
      })
    ).toEqual({ type: 'replace', worktree: fetchedWorktree });
  });

  it('retains the active worktree when the fetched entry is equivalent but a different object reference', () => {
    const activeWorktree = makeWorktree({
      path: '/repo-b/.worktrees/feature-b',
      head: 'def456',
      branch: 'feature-b',
    });
    const fetchedWorktree = makeWorktree({
      path: '/repo-b/.worktrees/feature-b',
      head: 'def456',
      branch: 'feature-b',
    });

    expect(
      resolveWorktreeSyncAction({
        worktrees: [fetchedWorktree],
        activeWorktree,
        selectedRepoCanLoad: true,
        worktreesFetched: true,
        worktreesFetching: false,
        hasWorktreeError: false,
      })
    ).toEqual({ type: 'retain' });
  });

  it('retains the active worktree when the fetched entry differs only by path casing', () => {
    const activeWorktree = makeWorktree({
      path: '/Repo/.worktrees/Feature-B',
      head: 'def456',
      branch: 'feature-b',
    });
    const fetchedWorktree = makeWorktree({
      path: '/repo/.worktrees/feature-b',
      head: 'ghi789',
      branch: 'feature-b',
    });

    expect(
      resolveWorktreeSyncAction({
        worktrees: [fetchedWorktree],
        activeWorktree,
        selectedRepoCanLoad: true,
        worktreesFetched: true,
        worktreesFetching: false,
        hasWorktreeError: false,
      })
    ).toEqual({ type: 'replace', worktree: fetchedWorktree });
  });

  it('clears the active worktree only after the selected repository stabilizes without it', () => {
    const activeWorktree = makeWorktree({ path: '/repo-b/.worktrees/feature-b' });

    expect(
      resolveWorktreeSyncAction({
        worktrees: [makeWorktree({ path: '/repo-b' })],
        activeWorktree,
        selectedRepoCanLoad: true,
        worktreesFetched: true,
        worktreesFetching: false,
        hasWorktreeError: false,
      })
    ).toEqual({ type: 'clear' });
  });

  it('clears the active worktree when the selected repository stabilized with an explicit worktree error', () => {
    const activeWorktree = makeWorktree({ path: '/repo-b/.worktrees/feature-b' });

    expect(
      resolveWorktreeSyncAction({
        worktrees: [],
        activeWorktree,
        selectedRepoCanLoad: true,
        worktreesFetched: true,
        worktreesFetching: false,
        hasWorktreeError: true,
      })
    ).toEqual({ type: 'clear' });
  });
});
