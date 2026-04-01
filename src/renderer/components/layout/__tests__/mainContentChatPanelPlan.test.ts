import { describe, expect, it } from 'vitest';
import { resolveMainContentChatPanelPlan } from '../mainContentChatPanelPlan';

describe('mainContentChatPanelPlan', () => {
  it('keeps the current worktree panel visible and cached worktrees mounted in the background', () => {
    expect(
      resolveMainContentChatPanelPlan({
        activeTab: 'chat',
        cachedChatPanelPaths: ['/repo/worktrees/older'],
        getRepoPathForWorktree: (worktreePath) =>
          worktreePath === '/repo/worktrees/older' ? '/repo' : null,
        hasActiveWorktree: true,
        retainedChatContext: {
          repoPath: '/repo',
          worktreePath: '/repo/worktrees/current',
        },
        shouldRenderCurrentChatPanel: true,
        showSubagentTranscript: false,
      })
    ).toEqual([
      {
        repoPath: '/repo',
        worktreePath: '/repo/worktrees/current',
        isCurrent: true,
        isVisible: true,
        isActive: true,
        showFallback: true,
      },
      {
        repoPath: '/repo',
        worktreePath: '/repo/worktrees/older',
        isCurrent: false,
        isVisible: false,
        isActive: false,
        showFallback: false,
      },
    ]);
  });

  it('keeps the current worktree panel mounted but hidden when a subagent transcript is active', () => {
    expect(
      resolveMainContentChatPanelPlan({
        activeTab: 'chat',
        cachedChatPanelPaths: [],
        getRepoPathForWorktree: () => null,
        hasActiveWorktree: true,
        retainedChatContext: {
          repoPath: '/repo',
          worktreePath: '/repo/worktrees/current',
        },
        shouldRenderCurrentChatPanel: true,
        showSubagentTranscript: true,
      })
    ).toEqual([
      {
        repoPath: '/repo',
        worktreePath: '/repo/worktrees/current',
        isCurrent: true,
        isVisible: false,
        isActive: false,
        showFallback: false,
      },
    ]);
  });

  it('drops the current worktree entry when the current chat panel should not be retained', () => {
    expect(
      resolveMainContentChatPanelPlan({
        activeTab: 'source-control',
        cachedChatPanelPaths: ['/repo/worktrees/older'],
        getRepoPathForWorktree: () => '/repo',
        hasActiveWorktree: true,
        retainedChatContext: {
          repoPath: '/repo',
          worktreePath: '/repo/worktrees/current',
        },
        shouldRenderCurrentChatPanel: false,
        showSubagentTranscript: false,
      })
    ).toEqual([
      {
        repoPath: '/repo',
        worktreePath: '/repo/worktrees/older',
        isCurrent: false,
        isVisible: false,
        isActive: false,
        showFallback: false,
      },
    ]);
  });
});
