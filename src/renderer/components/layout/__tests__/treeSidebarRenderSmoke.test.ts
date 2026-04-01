import type { GitWorktree } from '@shared/types';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_GROUP_ID } from '@/App/constants';

vi.mock('lucide-react', () => {
  const icon = (props: Record<string, unknown>) => React.createElement('svg', props);
  return {
    ChevronRight: icon,
    Clock: icon,
    EyeOff: icon,
    FolderGit2: icon,
    FolderMinus: icon,
    GitBranch: icon,
    List: icon,
    MoreHorizontal: icon,
    PanelLeftClose: icon,
    Plus: icon,
    RefreshCw: icon,
    Search: icon,
    Settings2: icon,
    X: icon,
  };
});

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  LayoutGroup: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  motion: new Proxy(
    {},
    {
      get: (_, tag: string) => {
        const Component = ({
          children,
          ...props
        }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) =>
          React.createElement(tag, props, children);
        return Component;
      },
    }
  ),
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string) => value,
    tNode: (value: string) => value,
  }),
}));

vi.mock('@/App/storage', async () => {
  const actual = await vi.importActual<typeof import('@/App/storage')>('@/App/storage');
  return {
    ...actual,
    getStoredGroupCollapsedState: () => ({}),
    getStoredRepositorySettings: () => ({}),
    saveGroupCollapsedState: vi.fn(),
    saveRepositorySettings: vi.fn(),
    getRepositorySettings: vi.fn(() => ({ hidden: false })),
  };
});

vi.mock('@/stores/settings', () => ({
  useSettingsStore: (selector: (state: { hideGroups: boolean }) => unknown) =>
    selector({ hideGroups: false }),
}));

const agentSessionsState = {
  sessions: [],
  activeIds: {},
};

vi.mock('@/stores/agentSessions', () => ({
  useAgentSessionsStore: (
    selector: (
      state: typeof agentSessionsState & { clearTaskCompletedUnreadByWorktree: () => void }
    ) => unknown
  ) =>
    selector({
      ...agentSessionsState,
      clearTaskCompletedUnreadByWorktree: vi.fn(),
    }),
}));

const worktreeActivityState = {
  activities: {},
  diffStats: {},
  activityStates: {},
  fetchDiffStats: vi.fn(),
  closeAgentSessions: vi.fn(),
  closeTerminalSessions: vi.fn(),
};

vi.mock('@/stores/worktreeActivity', () => ({
  useWorktreeActivityStore: (selector: (state: typeof worktreeActivityState) => unknown) =>
    selector(worktreeActivityState),
}));

vi.mock('@/hooks/useWindowFocus', () => ({
  useShouldPoll: () => false,
}));

vi.mock('@/hooks/useLiveSubagents', () => ({
  buildPolledLiveSubagentCwds: vi.fn(() => []),
  useLiveSubagents: vi.fn(() => new Map()),
}));

vi.mock('@/hooks/useWorktree', () => ({
  useWorktreeListMultiple: vi.fn(() => ({
    worktreesMap: {},
    errorsMap: {},
    loadingMap: {},
    refetchAll: vi.fn(),
  })),
}));

vi.mock('@/components/group', () => ({
  CreateGroupDialog: () => null,
  GroupEditDialog: () => null,
  GroupSelector: () => React.createElement('div', { 'data-group-selector': 'true' }),
  MoveToGroupSubmenu: () => null,
}));

vi.mock('@/components/repository/RepositoryManagerDialog', () => ({
  RepositoryManagerDialog: () => null,
}));

vi.mock('@/components/repository/RepositorySettingsDialog', () => ({
  RepositorySettingsDialog: () => null,
}));

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  AlertDialogClose: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  AlertDialogDescription: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  AlertDialogFooter: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  AlertDialogHeader: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  AlertDialogPopup: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  AlertDialogTitle: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) =>
    React.createElement('button', { ...props, type: props.type ?? 'button' }, children),
}));

vi.mock('@/components/ui/toast', () => ({
  toastManager: {
    add: vi.fn(),
  },
}));

vi.mock('@/components/worktree/CreateWorktreeDialog', () => ({
  CreateWorktreeDialog: () => null,
}));

vi.mock('../RunningProjectsPopover', () => ({
  RunningProjectsPopover: () => React.createElement('div', { 'data-running-projects': 'true' }),
}));

vi.mock('../SidebarEmptyState', () => ({
  SidebarEmptyState: ({ title }: { title: string }) =>
    React.createElement('div', { 'data-sidebar-empty': title }),
}));

vi.mock('../tree-sidebar/TempWorkspaceTreeItem', () => ({
  TempWorkspaceTreeItem: ({ item }: { item: { id: string } }) =>
    React.createElement('div', { 'data-temp-item': item.id }),
}));

vi.mock('../tree-sidebar/WorktreeTreeItem', () => ({
  WorktreeTreeItem: ({ worktree }: { worktree: GitWorktree }) =>
    React.createElement('div', { 'data-worktree-item': worktree.path }),
}));

describe('TreeSidebar render smoke', () => {
  beforeEach(() => {
    agentSessionsState.sessions = [];
    agentSessionsState.activeIds = {};
    worktreeActivityState.activities = {};
    worktreeActivityState.diffStats = {};
    worktreeActivityState.activityStates = {};
    worktreeActivityState.fetchDiffStats.mockReset();
  });

  it('renders a selected repository row without throwing at runtime', async () => {
    const { TreeSidebar } = await import('../TreeSidebar');

    const markup = renderToStaticMarkup(
      React.createElement(TreeSidebar, {
        repositories: [
          {
            id: 'repo-a',
            name: 'Repo A',
            path: '/repo-a',
            groupId: undefined,
          },
        ],
        selectedRepo: '/repo-a',
        activeWorktree: {
          path: '/repo-a',
          head: 'abc123',
          branch: 'main',
          isMainWorktree: true,
          isLocked: false,
          prunable: false,
        },
        worktrees: [
          {
            path: '/repo-a',
            head: 'abc123',
            branch: 'main',
            isMainWorktree: true,
            isLocked: false,
            prunable: false,
          },
        ],
        branches: [],
        onSelectRepo: vi.fn(),
        canLoadRepo: () => true,
        onActivateRemoteRepo: vi.fn(),
        onSelectWorktree: vi.fn(),
        onAddRepository: vi.fn(),
        onCreateWorktree: vi.fn(async () => {}),
        onRemoveWorktree: vi.fn(),
        onRefresh: vi.fn(),
        groups: [],
        activeGroupId: ALL_GROUP_ID,
        onSwitchGroup: vi.fn(),
        onCreateGroup: vi.fn(() => ({
          id: 'group',
          name: 'Group',
          emoji: 'G',
          color: '#000000',
          order: 0,
        })),
        onUpdateGroup: vi.fn(),
        onDeleteGroup: vi.fn(),
      })
    );

    expect(markup).toContain('data-running-projects="true"');
    expect(markup).not.toContain('data-sidebar-empty="No matches"');
  });
});
