import { describe, expect, it } from 'vitest';
import {
  canRecoverWorktreeListFromPreviousSnapshot,
  classifyWorktreeLoadError,
  normalizeWorktreeLoadErrorMessage,
  shouldRetryWorktreeLoadError,
} from '../worktreeLoadError';

describe('worktreeLoadError helpers', () => {
  it('classifies repository-metadata and transient spawn failures separately', () => {
    expect(classifyWorktreeLoadError('Invalid workdir: not a git repository')).toBe(
      'not-git-repository'
    );
    expect(classifyWorktreeLoadError('Error: spawn EBADF')).toBe('transient');
    expect(classifyWorktreeLoadError('fatal: unexpected failure')).toBe('generic');
  });

  it('normalizes repeated error prefixes for display', () => {
    expect(normalizeWorktreeLoadErrorMessage(new Error('Error: spawn EBADF'))).toBe('spawn EBADF');
  });

  it('retries only transient worktree load failures', () => {
    expect(shouldRetryWorktreeLoadError(0, new Error('spawn EBADF'))).toBe(true);
    expect(shouldRetryWorktreeLoadError(2, new Error('spawn EBADF'))).toBe(false);
    expect(shouldRetryWorktreeLoadError(0, new Error('not a git repository'))).toBe(false);
  });

  it('recovers transient failures only when a previous snapshot exists', () => {
    const previousWorktrees = [
      {
        path: '/repo',
        head: 'abc123',
        branch: 'main',
        isMainWorktree: true,
        isLocked: false,
        prunable: false,
      },
    ];

    expect(
      canRecoverWorktreeListFromPreviousSnapshot(new Error('spawn EBADF'), previousWorktrees)
    ).toBe(true);
    expect(canRecoverWorktreeListFromPreviousSnapshot(new Error('spawn EBADF'), [])).toBe(false);
    expect(
      canRecoverWorktreeListFromPreviousSnapshot(
        new Error('Invalid workdir: not a git repository'),
        previousWorktrees
      )
    ).toBe(false);
  });
});
