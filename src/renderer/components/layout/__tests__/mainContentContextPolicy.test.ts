import { describe, expect, it } from 'vitest';
import { resolveMainContentContext } from '../mainContentContextPolicy';

describe('mainContentContextPolicy', () => {
  it('keeps current panel paths bound to the active worktree', () => {
    expect(
      resolveMainContentContext({
        repoPath: '/repo/current',
        worktreePath: '/repo/current',
      })
    ).toEqual({
      hasActiveWorktree: true,
      currentRepoPath: '/repo/current',
      currentWorktreePath: '/repo/current',
      currentNormalizedWorktreePath: '/repo/current',
      retainedChatContext: {
        repoPath: '/repo/current',
        worktreePath: '/repo/current',
      },
      sourceControlRootPath: '/repo/current',
      reviewRootPath: '/repo/current',
      openInPath: '/repo/current',
    });
  });

  it('does not leak the last valid worktree into the current file panel context', () => {
    expect(
      resolveMainContentContext({
        repoPath: '/repo/next',
        lastValidContext: {
          repoPath: '/repo/previous',
          worktreePath: '/repo/previous/.worktrees/feature',
        },
      })
    ).toEqual({
      hasActiveWorktree: false,
      currentRepoPath: null,
      currentWorktreePath: null,
      currentNormalizedWorktreePath: null,
      retainedChatContext: {
        repoPath: '/repo/previous',
        worktreePath: '/repo/previous/.worktrees/feature',
      },
      sourceControlRootPath: null,
      reviewRootPath: null,
      openInPath: null,
    });
  });

  it('prefers explicit panel root overrides when a worktree is active', () => {
    expect(
      resolveMainContentContext({
        repoPath: '/repo/current',
        worktreePath: '/repo/current',
        sourceControlRootPath: '/repo/current/submodule',
        reviewRootPath: '/repo/current/review',
        openInPath: '/repo/current/docs',
      })
    ).toEqual({
      hasActiveWorktree: true,
      currentRepoPath: '/repo/current',
      currentWorktreePath: '/repo/current',
      currentNormalizedWorktreePath: '/repo/current',
      retainedChatContext: {
        repoPath: '/repo/current',
        worktreePath: '/repo/current',
      },
      sourceControlRootPath: '/repo/current/submodule',
      reviewRootPath: '/repo/current/review',
      openInPath: '/repo/current/docs',
    });
  });
});
