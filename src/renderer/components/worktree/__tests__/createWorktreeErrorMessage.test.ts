import { describe, expect, it } from 'vitest';
import { resolveCreateWorktreeErrorMessage } from '../createWorktreeErrorMessage';

describe('resolveCreateWorktreeErrorMessage', () => {
  const t = (value: string) => value;

  it('maps git branch conflict errors before generic already-exists messages', () => {
    expect(
      resolveCreateWorktreeErrorMessage("fatal: a branch named 'main' already exists", t)
    ).toBe('Branch already exists. Choose a different name.');
  });

  it('maps explicit local branch conflict errors to branch guidance', () => {
    expect(
      resolveCreateWorktreeErrorMessage(
        'Worktree branch conflicts with existing local branch: main. Choose a different name or create the worktree from the existing branch.',
        t
      )
    ).toBe('Branch already exists. Choose a different name.');
  });

  it('keeps path collision errors mapped to the worktree path guidance', () => {
    expect(
      resolveCreateWorktreeErrorMessage("fatal: '/repo/worktrees/main' already exists", t)
    ).toBe('Worktree path already exists. Choose a different path or branch name.');
  });

  it('returns the original message when no specialized mapping applies', () => {
    expect(resolveCreateWorktreeErrorMessage('fatal: unexpected failure', t)).toBe(
      'fatal: unexpected failure'
    );
  });
});
