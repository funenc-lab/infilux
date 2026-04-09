import type { GitWorktree } from '@shared/types';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WorktreeTreeItem } from '../tree-sidebar/WorktreeTreeItem';
import { WorktreeItem } from '../worktree-panel/WorktreeItem';

const WORKTREE: GitWorktree = {
  path: '/repo/.worktrees/feature-a',
  head: 'abc123',
  branch: 'feature-a',
  isMainWorktree: false,
  isLocked: false,
  prunable: false,
};

interface MockWorktreeActivityState {
  activities: Record<string, unknown>;
  diffStats: Record<string, unknown>;
  activityStates: Record<string, unknown>;
  closeAgentSessions: ReturnType<typeof vi.fn>;
  closeTerminalSessions: ReturnType<typeof vi.fn>;
  clearActivityState: ReturnType<typeof vi.fn>;
}

const { useWorktreeActivityStore } = vi.hoisted(() => {
  const state: MockWorktreeActivityState = {
    activities: {},
    diffStats: {},
    activityStates: {
      '/repo/.worktrees/feature-a': 'running',
    },
    closeAgentSessions: vi.fn(),
    closeTerminalSessions: vi.fn(),
    clearActivityState: vi.fn(),
  };

  const store = (<T>(selector: (state: MockWorktreeActivityState) => T): T => selector(state)) as {
    <T>(selector: (state: MockWorktreeActivityState) => T): T;
    getState: () => MockWorktreeActivityState;
  };

  store.getState = () => state;

  return {
    useWorktreeActivityStore: store,
  };
});

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string) => value,
  }),
}));

vi.mock('@/hooks/useGitSync', () => ({
  useGitSync: () => ({
    gitStatus: null,
    refetchStatus: vi.fn(),
    isSyncing: false,
    ahead: 0,
    behind: 0,
    tracking: null,
    currentBranch: 'feature-a',
    handleSync: vi.fn(),
    handlePublish: vi.fn(),
  }),
}));

vi.mock('@/hooks/useOutputState', () => ({
  useWorktreeTaskCompletionNotice: () => false,
}));

vi.mock('@/stores/worktreeActivity', () => ({
  useWorktreeActivityStore,
}));

vi.mock('@/stores/agentSessions', () => ({
  useAgentSessionsStore: <T>(
    selector: (state: { clearTaskCompletedUnreadByWorktree: () => void }) => T
  ): T =>
    selector({
      clearTaskCompletedUnreadByWorktree: vi.fn(),
    }),
}));

vi.mock('@/components/ui/toast', () => ({
  toastManager: {
    add: vi.fn(),
  },
}));

function expectLeadingStatusDot(markup: string) {
  expect(markup).toMatch(
    /control-tree-status-slot[\s\S]*?control-tree-state-dot[\s\S]*?control-tree-glyph[\s\S]*?feature-a/
  );
  expect(markup).not.toMatch(/control-tree-title-row[\s\S]*?control-tree-state-dot/);
  expect(markup).not.toContain('control-tree-meta control-tree-meta-row');
}

describe('worktree status dot layout', () => {
  it('renders the tree sidebar status dot in a leading status slot instead of the title row', () => {
    const markup = renderToStaticMarkup(
      React.createElement(WorktreeTreeItem, {
        worktree: WORKTREE,
        isActive: true,
        onClick: vi.fn(),
        onDelete: vi.fn(),
      })
    );

    expectLeadingStatusDot(markup);
  });

  it('renders the worktree panel status dot in a leading status slot instead of the title row', () => {
    const markup = renderToStaticMarkup(
      React.createElement(WorktreeItem, {
        worktree: WORKTREE,
        isActive: true,
        onClick: vi.fn(),
        onDelete: vi.fn(),
      })
    );

    expectLeadingStatusDot(markup);
  });
});
