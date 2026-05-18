import { describe, expect, it } from 'vitest';
import { resolveVisibleChatBridgeContext } from '../chatWorktreeTransitionPolicy';

describe('chatWorktreeTransitionPolicy', () => {
  it('keeps the previous visible chat context while the next worktree is still restoring', () => {
    expect(
      resolveVisibleChatBridgeContext({
        activeTab: 'chat',
        agentSessionDisplayMode: 'tab',
        currentChatSessionCount: 0,
        currentContext: {
          repoPath: '/repo',
          worktreePath: '/repo/worktrees/next',
        },
        hasActiveWorktree: true,
        lastVisibleChatContext: {
          repoPath: '/repo',
          worktreePath: '/repo/worktrees/current',
        },
        recoveryStatus: 'restoring',
        shouldRenderCurrentChatPanel: true,
        showSubagentTranscript: false,
      })
    ).toEqual({
      repoPath: '/repo',
      worktreePath: '/repo/worktrees/current',
    });
  });

  it('releases the bridge once the next worktree already has session content', () => {
    expect(
      resolveVisibleChatBridgeContext({
        activeTab: 'chat',
        agentSessionDisplayMode: 'tab',
        currentChatSessionCount: 1,
        currentContext: {
          repoPath: '/repo',
          worktreePath: '/repo/worktrees/next',
        },
        hasActiveWorktree: true,
        lastVisibleChatContext: {
          repoPath: '/repo',
          worktreePath: '/repo/worktrees/current',
        },
        recoveryStatus: 'restoring',
        shouldRenderCurrentChatPanel: true,
        showSubagentTranscript: false,
      })
    ).toBeNull();
  });

  it('does not bridge the workspace canvas host across worktree switches', () => {
    expect(
      resolveVisibleChatBridgeContext({
        activeTab: 'chat',
        agentSessionDisplayMode: 'global-canvas',
        currentChatSessionCount: 0,
        currentContext: {
          repoPath: '/repo',
          worktreePath: '/repo/worktrees/next',
        },
        hasActiveWorktree: true,
        lastVisibleChatContext: {
          repoPath: '/repo',
          worktreePath: '/repo/worktrees/current',
        },
        recoveryStatus: 'restoring',
        shouldRenderCurrentChatPanel: true,
        showSubagentTranscript: false,
      })
    ).toBeNull();
  });
});
