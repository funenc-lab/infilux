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

  it('maps bad file descriptor spawn failures to a restart-required state', () => {
    expect(resolveWorktreeLoadErrorState('Error: spawn EBADF')).toEqual(
      expect.objectContaining({
        kind: 'runtime-restart-required',
        tone: 'danger',
        title: 'Restart Infilux to recover Git',
        status: 'Git runtime requires restart',
      })
    );
  });
});
