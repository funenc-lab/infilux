import { describe, expect, it } from 'vitest';
import {
  resolveMainContentChatPanelEntryKey,
  resolveMainContentChatPanelPlan,
} from '../mainContentChatPanelPlan';

describe('mainContentChatPanelPlan', () => {
  it('keeps the current worktree panel visible and cached worktrees mounted in the background', () => {
    expect(
      resolveMainContentChatPanelPlan({
        activeTab: 'chat',
        agentSessionDisplayMode: 'tab',
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
        visibleChatBridgeContext: null,
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
        agentSessionDisplayMode: 'tab',
        cachedChatPanelPaths: [],
        getRepoPathForWorktree: () => null,
        hasActiveWorktree: true,
        retainedChatContext: {
          repoPath: '/repo',
          worktreePath: '/repo/worktrees/current',
        },
        shouldRenderCurrentChatPanel: true,
        showSubagentTranscript: true,
        visibleChatBridgeContext: null,
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
        agentSessionDisplayMode: 'tab',
        cachedChatPanelPaths: ['/repo/worktrees/older'],
        getRepoPathForWorktree: () => '/repo',
        hasActiveWorktree: true,
        retainedChatContext: {
          repoPath: '/repo',
          worktreePath: '/repo/worktrees/current',
        },
        shouldRenderCurrentChatPanel: false,
        showSubagentTranscript: false,
        visibleChatBridgeContext: null,
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

  it('drops cached worktree chat panels while the workspace canvas host owns chat rendering', () => {
    expect(
      resolveMainContentChatPanelPlan({
        activeTab: 'chat',
        agentSessionDisplayMode: 'global-canvas',
        cachedChatPanelPaths: ['/repo/worktrees/older'],
        getRepoPathForWorktree: () => '/repo',
        hasActiveWorktree: true,
        retainedChatContext: {
          repoPath: '/repo',
          worktreePath: '/repo/worktrees/current',
        },
        shouldRenderCurrentChatPanel: true,
        showSubagentTranscript: false,
        visibleChatBridgeContext: null,
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
    ]);
  });

  it('uses one global key for the current global canvas panel across repositories', () => {
    const firstRepoEntry = {
      repoPath: '/repo-a',
      worktreePath: '/repo-a/worktrees/current',
      isCurrent: true,
      isVisible: true,
      isActive: true,
      showFallback: true,
    };
    const secondRepoEntry = {
      repoPath: '/repo-b',
      worktreePath: '/repo-b/worktrees/current',
      isCurrent: true,
      isVisible: true,
      isActive: true,
      showFallback: true,
    };

    expect(resolveMainContentChatPanelEntryKey(firstRepoEntry, 'global-canvas')).toBe(
      'chat:workspace:all'
    );
    expect(resolveMainContentChatPanelEntryKey(secondRepoEntry, 'global-canvas')).toBe(
      'chat:workspace:all'
    );
  });

  it('keeps worktree-scoped keys for non-global canvas modes and cached panels', () => {
    const entry = {
      repoPath: '/repo',
      worktreePath: '/repo/worktrees/current',
      isCurrent: true,
      isVisible: true,
      isActive: true,
      showFallback: true,
    };

    expect(resolveMainContentChatPanelEntryKey(entry, 'tab')).toBe('chat:/repo/worktrees/current');
    expect(resolveMainContentChatPanelEntryKey(entry, 'canvas')).toBe(
      'chat:/repo/worktrees/current'
    );
    expect(
      resolveMainContentChatPanelEntryKey({ ...entry, isCurrent: false }, 'global-canvas')
    ).toBe('chat:/repo/worktrees/current');
  });

  it('keeps the previous worktree panel visible while the current worktree chat restores', () => {
    expect(
      resolveMainContentChatPanelPlan({
        activeTab: 'chat',
        agentSessionDisplayMode: 'tab',
        cachedChatPanelPaths: [],
        getRepoPathForWorktree: () => null,
        hasActiveWorktree: true,
        retainedChatContext: {
          repoPath: '/repo',
          worktreePath: '/repo/worktrees/next',
        },
        shouldRenderCurrentChatPanel: true,
        showSubagentTranscript: false,
        visibleChatBridgeContext: {
          repoPath: '/repo',
          worktreePath: '/repo/worktrees/current',
        },
      })
    ).toEqual([
      {
        repoPath: '/repo',
        worktreePath: '/repo/worktrees/next',
        isCurrent: true,
        isVisible: false,
        isActive: false,
        showFallback: false,
      },
      {
        repoPath: '/repo',
        worktreePath: '/repo/worktrees/current',
        isCurrent: false,
        isVisible: true,
        isActive: true,
        showFallback: false,
      },
    ]);
  });
});
