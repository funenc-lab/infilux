import { describe, expect, it } from 'vitest';
import { resolveWorktreeLoadErrorState } from '../worktreeLoadErrorState';

describe('resolveWorktreeLoadErrorState', () => {
  it('keeps repository initialization copy for actual non-repositories', () => {
    expect(resolveWorktreeLoadErrorState('Invalid workdir: not a git repository')).toEqual(
      expect.objectContaining({
        kind: 'not-git-repository',
        tone: 'danger',
        title: 'Not a Git repository',
        inlineDescription: 'Initialize Git here to create and manage worktrees.',
      })
    );
  });

  it('maps transient spawn failures to a retryable unavailable state', () => {
    expect(resolveWorktreeLoadErrorState('Error: spawn EBADF')).toEqual(
      expect.objectContaining({
        kind: 'transient',
        tone: 'warning',
        title: 'Git temporarily unavailable',
        status: 'Git process launch failed',
      })
    );
  });
});
