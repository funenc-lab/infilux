/* @vitest-environment jsdom */

import type { GitWorktree, TempWorkspaceItem } from '@shared/types';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_GROUP_ID } from '@/App/constants';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const useWorktreeListMultipleMock = vi.fn();

vi.mock('lucide-react', () => {
  const icon = (props: Record<string, unknown>) => React.createElement('svg', props);
  return {
    ChevronRight: icon,
    Clock: icon,
    EyeOff: icon,
    Filter: icon,
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
    getStoredTreeSidebarExpandedRepos: () => ['/repo-a'],
    getStoredTreeSidebarTempExpanded: () => true,
    getStoredRepositorySettings: () => ({}),
    saveGroupCollapsedState: vi.fn(),
    saveTreeSidebarExpandedRepos: vi.fn(),
    saveTreeSidebarTempExpanded: vi.fn(),
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
  useWorktreeListMultiple: (inputs: Array<string | { repoPath: string; enabled: boolean }> = []) =>
    useWorktreeListMultipleMock(inputs),
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
  TempWorkspaceTreeItem: ({ item }: { item: TempWorkspaceItem }) =>
    React.createElement('div', { 'data-temp-item': item.id }, item.title),
}));

vi.mock('../tree-sidebar/WorktreeTreeItem', () => ({
  WorktreeTreeItem: ({ worktree }: { worktree: GitWorktree }) =>
    React.createElement('div', { 'data-worktree-item': worktree.path }, worktree.branch),
}));

const repoWorktrees: Record<string, GitWorktree[]> = {
  '/repo-a': [
    {
      path: '/repo-a/main',
      head: 'aaa111',
      branch: 'main',
      isMainWorktree: true,
      isLocked: false,
      prunable: false,
    },
    {
      path: '/repo-a/agent-task',
      head: 'bbb222',
      branch: 'agent-task',
      isMainWorktree: false,
      isLocked: false,
      prunable: false,
    },
  ],
  '/repo-b': [
    {
      path: '/repo-b/main',
      head: 'ccc333',
      branch: 'main',
      isMainWorktree: true,
      isLocked: false,
      prunable: false,
    },
  ],
};

function buildUseWorktreeListResponse(
  inputs: Array<string | { repoPath: string; enabled: boolean }> = []
) {
  const requestedRepoPaths = inputs.map((input) =>
    typeof input === 'string' ? input : input.repoPath
  );
  const worktreesMap: Record<string, GitWorktree[]> = {};

  for (const repoPath of requestedRepoPaths) {
    if (repoWorktrees[repoPath]) {
      worktreesMap[repoPath] = repoWorktrees[repoPath];
    }
  }

  return {
    worktreesMap,
    errorsMap: {},
    loadingMap: {},
    refetchAll: vi.fn(),
  };
}

async function mountTreeSidebar() {
  const { TreeSidebar } = await import('../TreeSidebar');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(TreeSidebar, {
        repositories: [
          {
            id: 'repo-a',
            name: 'Repo A',
            path: '/repo-a',
            groupId: undefined,
          },
          {
            id: 'repo-b',
            name: 'Repo B',
            path: '/repo-b',
            groupId: undefined,
          },
        ],
        selectedRepo: '/repo-a',
        activeWorktree: repoWorktrees['/repo-a'][1],
        worktrees: repoWorktrees['/repo-a'],
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
        temporaryWorkspaceEnabled: true,
        tempBasePath: '/tmp/sessions',
        tempWorkspaces: [
          {
            id: 'temp-agent',
            title: 'Agent Scratch',
            folderName: 'agent-scratch',
            path: '/tmp/temp-agent',
            createdAt: 10,
          },
          {
            id: 'temp-idle',
            title: 'Idle Scratch',
            folderName: 'idle-scratch',
            path: '/tmp/temp-idle',
            createdAt: 9,
          },
        ],
        onSelectTempWorkspace: vi.fn(),
      })
    );
  });

  return {
    container,
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('TreeSidebar agent filter', () => {
  beforeEach(() => {
    worktreeActivityState.activities = {
      '/repo-a/main': { agentCount: 0, terminalCount: 0 },
      '/repo-a/agent-task': { agentCount: 1, terminalCount: 0 },
      '/repo-b/main': { agentCount: 0, terminalCount: 2 },
      '/tmp/temp-agent': { agentCount: 1, terminalCount: 0 },
      '/tmp/temp-idle': { agentCount: 0, terminalCount: 0 },
    };
    worktreeActivityState.diffStats = {};
    worktreeActivityState.activityStates = {};
    worktreeActivityState.fetchDiffStats.mockReset();
    useWorktreeListMultipleMock.mockReset();
    useWorktreeListMultipleMock.mockImplementation(buildUseWorktreeListResponse);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('shows only repos, worktrees, and temp sessions with agent activity after toggling the filter', async () => {
    const view = await mountTreeSidebar();

    try {
      const initialToggle = view.container.querySelector(
        'button[title="Only show Agent worktrees"]'
      ) as HTMLButtonElement | null;
      const searchInput = view.container.querySelector(
        'input[aria-label="Search projects"]'
      ) as HTMLInputElement | null;

      expect(initialToggle).not.toBeNull();
      expect(initialToggle?.textContent).toContain('Agent');
      expect(searchInput?.getAttribute('placeholder')).toBe('Search projects');
      expect(view.container.textContent).toContain('Repo A');
      expect(view.container.textContent).toContain('Repo B');
      expect(view.container.querySelector('[data-worktree-item="/repo-a/main"]')).not.toBeNull();
      expect(
        view.container.querySelector('[data-worktree-item="/repo-a/agent-task"]')
      ).not.toBeNull();
      expect(view.container.querySelector('[data-temp-item="temp-agent"]')).not.toBeNull();
      expect(view.container.querySelector('[data-temp-item="temp-idle"]')).not.toBeNull();

      await act(async () => {
        initialToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(view.container.textContent).toContain('Repo A');
      expect(view.container.textContent).not.toContain('Repo B');
      expect(
        view.container.querySelector('[data-worktree-item="/repo-a/agent-task"]')
      ).not.toBeNull();
      expect(view.container.querySelector('[data-worktree-item="/repo-a/main"]')).toBeNull();
      expect(view.container.querySelector('[data-worktree-item="/repo-b/main"]')).toBeNull();
      expect(view.container.querySelector('[data-temp-item="temp-agent"]')).not.toBeNull();
      expect(view.container.querySelector('[data-temp-item="temp-idle"]')).toBeNull();
    } finally {
      view.unmount();
    }
  });

  it('triggers worktree prefetch for non-expanded repos when the agent filter is enabled', async () => {
    const view = await mountTreeSidebar();

    try {
      useWorktreeListMultipleMock.mockClear();

      const toggle = view.container.querySelector(
        'button[title="Only show Agent worktrees"]'
      ) as HTMLButtonElement | null;

      await act(async () => {
        toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(useWorktreeListMultipleMock).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ repoPath: '/repo-b', enabled: true })])
      );
    } finally {
      view.unmount();
    }
  });
});
