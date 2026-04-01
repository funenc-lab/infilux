import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('lucide-react', () => ({
  FolderGit2: (props: Record<string, unknown>) => React.createElement('svg', props),
  GitBranch: (props: Record<string, unknown>) => React.createElement('svg', props),
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string) => value,
  }),
}));

vi.mock('@/components/ui/empty', () => ({
  Empty: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  EmptyDescription: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  EmptyHeader: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  EmptyMedia: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  EmptyTitle: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
}));

vi.mock('@/components/layout/RepositorySidebar', () => ({
  RepositorySidebar: ({ selectedRepo }: { selectedRepo?: string | null }) =>
    React.createElement('div', { 'data-repository-sidebar': selectedRepo ?? 'none' }),
}));

vi.mock('@/components/layout/TreeSidebar', () => ({
  TreeSidebar: ({ selectedRepo }: { selectedRepo?: string | null }) =>
    React.createElement('div', { 'data-tree-sidebar': selectedRepo ?? 'none' }),
}));

vi.mock('@/components/layout/WorktreePanel', () => ({
  WorktreePanel: ({ projectName }: { projectName?: string }) =>
    React.createElement('div', { 'data-worktree-panel': projectName ?? 'none' }),
}));

vi.mock('../ControlStateCard', () => ({
  ControlStateCard: ({ title }: { title: string }) =>
    React.createElement('div', { 'data-control-state-card': title }),
}));

describe('Deferred sidebar panels', () => {
  it('renders a loading placeholder before RepositorySidebar resolves', async () => {
    const { DeferredRepositorySidebar } = await import('../DeferredRepositorySidebar');

    const markup = renderToStaticMarkup(
      React.createElement(DeferredRepositorySidebar, {
        repositories: [],
        selectedRepo: '/repo',
        onSelectRepo: () => {},
        canLoadRepo: () => true,
        onAddRepository: () => {},
        groups: [],
        activeGroupId: 'all',
        onSwitchGroup: () => {},
        onCreateGroup: () => ({ id: 'group', name: 'Group', emoji: 'G', color: 'blue', order: 0 }),
        onUpdateGroup: () => {},
        onDeleteGroup: () => {},
      })
    );

    expect(markup).toContain('data-control-state-card="Loading repositories"');
    expect(markup).not.toContain('data-repository-sidebar');
  });

  it('renders a loading placeholder before TreeSidebar resolves', async () => {
    const { DeferredTreeSidebar } = await import('../DeferredTreeSidebar');

    const markup = renderToStaticMarkup(
      React.createElement(DeferredTreeSidebar, {
        repositories: [],
        selectedRepo: '/repo',
        activeWorktree: null,
        worktrees: [],
        branches: [],
        onSelectRepo: () => {},
        canLoadRepo: () => true,
        onActivateRemoteRepo: () => {},
        onSelectWorktree: () => {},
        onAddRepository: () => {},
        onCreateWorktree: async () => {},
        onRemoveWorktree: () => {},
        onRefresh: () => {},
        groups: [],
        activeGroupId: 'all',
        onSwitchGroup: () => {},
        onCreateGroup: () => ({ id: 'group', name: 'Group', emoji: 'G', color: 'blue', order: 0 }),
        onUpdateGroup: () => {},
        onDeleteGroup: () => {},
      })
    );

    expect(markup).toContain('data-control-state-card="Loading workspace tree"');
    expect(markup).not.toContain('data-tree-sidebar');
  });

  it('renders a loading placeholder before WorktreePanel resolves', async () => {
    const { DeferredWorktreePanel } = await import('../DeferredWorktreePanel');

    const markup = renderToStaticMarkup(
      React.createElement(DeferredWorktreePanel, {
        worktrees: [],
        activeWorktree: null,
        branches: [],
        projectName: 'repo',
        onSelectWorktree: () => {},
        onCreateWorktree: async () => {},
        onRemoveWorktree: () => {},
        onRefresh: () => {},
      })
    );

    expect(markup).toContain('data-control-state-card="Loading worktrees"');
    expect(markup).not.toContain('data-worktree-panel');
  });
});
