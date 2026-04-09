import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildMainContentRenderPlan } from '../mainContentRenderPlan';

describe('mainContentRenderPlan', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps active current panels rendered and excludes the current worktree from cached panels', () => {
    expect(
      buildMainContentRenderPlan({
        activeTab: 'chat',
        effectiveWorktreePath: '/repo/current',
        retainedChatPanelPaths: ['/repo/current', '/repo/older'],
        retainedTerminalPanelPaths: ['/repo/current', '/repo/terminal-old'],
        retainedFilePanelPaths: ['/repo/current', '/repo/file-old'],
        currentChatRetentionState: 'cold',
        hasCurrentTerminalActivity: false,
        currentFileTabCount: 0,
      })
    ).toEqual({
      shouldRenderCurrentChatPanel: true,
      shouldRenderCurrentTerminalPanel: false,
      shouldRenderCurrentFilePanel: false,
      cachedChatPanelPaths: ['/repo/older'],
      cachedTerminalPanelPaths: ['/repo/terminal-old'],
      cachedFilePanelPaths: ['/repo/file-old'],
    });
  });

  it('retains inactive current panels when the current worktree still has content', () => {
    expect(
      buildMainContentRenderPlan({
        activeTab: 'source-control',
        effectiveWorktreePath: '/repo/current',
        retainedChatPanelPaths: ['/repo/current'],
        retainedTerminalPanelPaths: ['/repo/current'],
        retainedFilePanelPaths: ['/repo/current'],
        currentChatRetentionState: 'warm',
        hasCurrentTerminalActivity: true,
        currentFileTabCount: 2,
      })
    ).toEqual({
      shouldRenderCurrentChatPanel: true,
      shouldRenderCurrentTerminalPanel: true,
      shouldRenderCurrentFilePanel: true,
      cachedChatPanelPaths: [],
      cachedTerminalPanelPaths: [],
      cachedFilePanelPaths: [],
    });
  });

  it('releases inactive current panels when the current worktree has no content left', () => {
    expect(
      buildMainContentRenderPlan({
        activeTab: 'source-control',
        effectiveWorktreePath: '/repo/current',
        retainedChatPanelPaths: ['/repo/older-chat'],
        retainedTerminalPanelPaths: ['/repo/older-terminal'],
        retainedFilePanelPaths: ['/repo/older-file'],
        currentChatRetentionState: 'cold',
        hasCurrentTerminalActivity: false,
        currentFileTabCount: 0,
      })
    ).toEqual({
      shouldRenderCurrentChatPanel: false,
      shouldRenderCurrentTerminalPanel: false,
      shouldRenderCurrentFilePanel: false,
      cachedChatPanelPaths: ['/repo/older-chat'],
      cachedTerminalPanelPaths: ['/repo/older-terminal'],
      cachedFilePanelPaths: ['/repo/older-file'],
    });
  });

  it('deduplicates cached panel paths using normalized worktree keys', () => {
    expect(
      buildMainContentRenderPlan({
        activeTab: 'source-control',
        effectiveWorktreePath: '/repo/current',
        retainedChatPanelPaths: ['/Repo/Older', '/repo/older', '/repo/second'],
        retainedTerminalPanelPaths: ['/Repo/Terminal', '/repo/terminal'],
        retainedFilePanelPaths: ['/Repo/File', '/repo/file'],
        currentChatRetentionState: 'cold',
        hasCurrentTerminalActivity: false,
        currentFileTabCount: 0,
      })
    ).toEqual({
      shouldRenderCurrentChatPanel: false,
      shouldRenderCurrentTerminalPanel: false,
      shouldRenderCurrentFilePanel: false,
      cachedChatPanelPaths: ['/Repo/Older', '/repo/second'],
      cachedTerminalPanelPaths: ['/Repo/Terminal'],
      cachedFilePanelPaths: ['/Repo/File'],
    });
  });
});
