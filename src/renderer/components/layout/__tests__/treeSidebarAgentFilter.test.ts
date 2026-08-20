/* @vitest-environment jsdom */

import type { GitWorktree, TempWorkspaceItem } from '@shared/types';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_GROUP_ID } from '@/App/constants';
import type { Session } from '@/components/chat/SessionBar';
import type { SessionRuntimeState } from '@/stores/agentSessions';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const useWorktreeListMultipleMock = vi.fn();
let shouldPollValue = false;
type WorktreeListInput = string | { repoPath: string; enabled: boolean };

vi.mock('lucide-react', () => {
  const icon = (props: Record<string, unknown>) => React.createElement('svg', props);
  return {
    Activity: icon,
    BotMessageSquare: icon,
    ChevronDown: icon,
    ChevronRight: icon,
    Clock: icon,
    EyeOff: icon,
    Filter: icon,
    FolderGit2: icon,
    FolderMinus: icon,
    GitBranch: icon,
    List: icon,
    ListCollapse: icon,
    MoreHorizontal: icon,
    PanelLeftClose: icon,
    PanelLeftOpen: icon,
    Plus: icon,
    RefreshCw: icon,
    Search: icon,
    Settings2: icon,
    Sparkles: icon,
    X: icon,
  };
});

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string, variables?: Record<string, string | number>) =>
      value.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => String(variables?.[key] ?? '')),
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

const agentSessionsState: {
  sessions: Session[];
  activeIds: Record<string, string | null>;
  runtimeStates: Record<string, SessionRuntimeState>;
} = {
  sessions: [],
  activeIds: {},
  runtimeStates: {},
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
  diffStatsScopes: {},
  activityStates: {},
  fetchDiffStats: vi.fn(),
  registerDiffStatsScope: vi.fn(),
  unregisterDiffStatsScope: vi.fn(),
  closeAgentSessions: vi.fn(),
  closeTerminalSessions: vi.fn(),
};

function agentSession(overrides: Partial<Session> & Pick<Session, 'id' | 'cwd'>): Session {
  const { id, cwd, ...rest } = overrides;
  return {
    id,
    name: rest.name ?? id,
    agentId: rest.agentId ?? 'codex',
    agentCommand: rest.agentCommand ?? 'codex',
    initialized: rest.initialized ?? true,
    repoPath: rest.repoPath ?? '/repo-a',
    cwd,
    environment: rest.environment ?? 'native',
    ...rest,
  };
}

function runtimeState(overrides: Partial<SessionRuntimeState> = {}): SessionRuntimeState {
  return {
    outputState: overrides.outputState ?? 'idle',
    lastActivityAt: overrides.lastActivityAt ?? 1,
    wasActiveWhenOutputting: overrides.wasActiveWhenOutputting ?? false,
    ...overrides,
  };
}

vi.mock('@/stores/worktreeActivity', () => ({
  useWorktreeActivityStore: (selector: (state: typeof worktreeActivityState) => unknown) =>
    selector(worktreeActivityState),
}));

vi.mock('@/hooks/useWindowFocus', () => ({
  useShouldPoll: () => shouldPollValue,
}));

vi.mock('@/hooks/useLiveSubagents', () => ({
  buildPolledLiveSubagentCwds: vi.fn(() => []),
  useLiveSubagents: vi.fn(() => new Map()),
}));

vi.mock('@/hooks/useWorktree', () => ({
  useWorktreeListMultiple: (inputs: WorktreeListInput[] = []) =>
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
  CreateWorktreeDialog: ({
    open,
    onSubmit,
  }: {
    open?: boolean;
    onSubmit: (options: { path: string; branch: string; newBranch: string }) => Promise<void>;
  }) =>
    open
      ? React.createElement(
          'button',
          {
            type: 'button',
            'data-create-worktree-submit': 'true',
            onClick: () =>
              void onSubmit({
                path: '/repo-a/new-agent-task',
                branch: 'main',
                newBranch: 'new-agent-task',
              }),
          },
          'Submit new worktree'
        )
      : null,
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
  '/repo-empty': [],
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

function buildUseWorktreeListResponse(inputs: WorktreeListInput[] = []) {
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

async function mountTreeSidebar(
  overrides: Partial<React.ComponentProps<typeof import('../TreeSidebar')['TreeSidebar']>> = {}
) {
  const { TreeSidebar } = await import('../TreeSidebar');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const defaultProps: React.ComponentProps<typeof TreeSidebar> = {
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
  };
  let currentProps = { ...defaultProps, ...overrides };

  const render = async () => {
    await act(async () => {
      root.render(React.createElement(TreeSidebar, currentProps));
    });
  };

  await render();

  return {
    container,
    async rerender(nextOverrides: Partial<React.ComponentProps<typeof TreeSidebar>>) {
      currentProps = { ...currentProps, ...nextOverrides };
      await render();
    },
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
    shouldPollValue = false;
    agentSessionsState.sessions = [];
    agentSessionsState.activeIds = {};
    agentSessionsState.runtimeStates = {};
    agentSessionsState.sessions = [
      agentSession({ id: 'running-repo-a', cwd: '/repo-a/agent-task' }),
      agentSession({
        id: 'running-temp',
        cwd: '/tmp/temp-agent',
        repoPath: '/tmp/temp-agent',
      }),
    ];
    agentSessionsState.runtimeStates = {
      'running-repo-a': runtimeState({ outputState: 'outputting' }),
      'running-temp': runtimeState({ waitingForInput: true }),
    };
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
        'button[title="Only show live Agent sessions"]'
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

  it('applies the active group before calculating progressive visibility', async () => {
    const alphaRepositories = Array.from({ length: 10 }, (_, index) => ({
      id: `alpha-${index}`,
      name: `Alpha ${index}`,
      path: `/alpha/${index}`,
      groupId: 'alpha',
      lastAccessedAt: index,
    }));
    const betaRepositories = Array.from({ length: 10 }, (_, index) => ({
      id: `beta-${index}`,
      name: `Beta ${index}`,
      path: `/beta/${index}`,
      groupId: 'beta',
      lastAccessedAt: 100 + index,
    }));
    const view = await mountTreeSidebar({
      repositories: [...alphaRepositories, ...betaRepositories],
      selectedRepo: '/beta/0',
      activeWorktree: null,
      worktrees: [],
      groups: [
        { id: 'alpha', name: 'Alpha', emoji: 'A', color: '#336699', order: 0 },
        { id: 'beta', name: 'Beta', emoji: 'B', color: '#993366', order: 1 },
      ],
      activeGroupId: 'alpha',
    });

    try {
      const visibleAlphaRows = alphaRepositories.filter((repository) =>
        Array.from(view.container.querySelectorAll('button')).some((button) =>
          button.textContent?.includes(repository.name)
        )
      );

      expect(visibleAlphaRows).toHaveLength(8);
      expect(view.container.textContent).not.toContain('Beta 9');
      expect(
        view.container.querySelector('button[aria-label="Show 2 more projects"]')
      ).not.toBeNull();
    } finally {
      view.unmount();
    }
  });

  it('collapses grouped projects and repositories without hiding temp sessions', async () => {
    const view = await mountTreeSidebar({
      repositories: [
        { id: 'repo-a', name: 'Repo A', path: '/repo-a', groupId: 'alpha' },
        { id: 'repo-b', name: 'Repo B', path: '/repo-b', groupId: 'beta' },
      ],
      groups: [
        { id: 'alpha', name: 'Alpha', emoji: 'A', color: '#336699', order: 0 },
        { id: 'beta', name: 'Beta', emoji: 'B', color: '#993366', order: 1 },
      ],
    });

    try {
      const moreActionsButton = view.container.querySelector<HTMLButtonElement>(
        'button[aria-label="More project actions"]'
      );
      expect(moreActionsButton).not.toBeNull();
      expect(view.container.querySelector('[data-worktree-item="/repo-a/main"]')).not.toBeNull();
      expect(view.container.querySelector('[data-temp-item="temp-agent"]')).not.toBeNull();

      await act(async () => {
        moreActionsButton?.click();
      });

      const collapseAllButton = Array.from(
        document.querySelectorAll<HTMLElement>('[role="menuitem"]')
      ).find((item) => item.textContent?.includes('Collapse all'));
      expect(collapseAllButton?.textContent).toContain('Collapse all');

      await act(async () => {
        collapseAllButton?.click();
      });

      expect(view.container.querySelector('#tree-section-alpha')).toBeNull();
      expect(view.container.querySelector('#tree-section-beta')).toBeNull();
      expect(view.container.querySelector('[data-worktree-item="/repo-a/main"]')).toBeNull();
      expect(view.container.querySelector('[data-temp-item="temp-agent"]')).not.toBeNull();
      expect(collapseAllButton?.getAttribute('data-disabled')).toBe('');
    } finally {
      view.unmount();
    }
  });

  it('keeps the selected repository and active worktree identifiable after collapsing it', async () => {
    const view = await mountTreeSidebar();

    try {
      const disclosure = view.container.querySelector<HTMLButtonElement>(
        'button[aria-label="Collapse repository worktrees"]'
      );

      expect(disclosure).not.toBeNull();

      await act(async () => {
        disclosure?.click();
      });

      const selectedRepository = view.container.querySelector<HTMLElement>(
        '.control-tree-node[data-active="repo"]'
      );

      expect(selectedRepository?.dataset.selectionTone).toBe('default');
      expect(selectedRepository?.textContent).toContain('agent-task');
      expect(
        selectedRepository?.querySelector('[data-current-worktree="true"]')?.getAttribute('title')
      ).toBe('Current worktree: agent-task');
    } finally {
      view.unmount();
    }
  });

  it('supports arrow-key navigation between repository tree items', async () => {
    const view = await mountTreeSidebar();

    try {
      const repositoryItems = Array.from(
        view.container.querySelectorAll<HTMLButtonElement>(
          '[data-tree-navigation-item="repository"]'
        )
      );

      expect(repositoryItems).toHaveLength(4);

      await act(async () => {
        repositoryItems[0]?.focus();
        repositoryItems[0]?.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
        );
      });

      expect(document.activeElement).toBe(repositoryItems[1]);
    } finally {
      view.unmount();
    }
  });

  it('keeps focus on a collapsed root repository when ArrowLeft is pressed', async () => {
    const view = await mountTreeSidebar();

    try {
      const allProjectsSection = view.container.querySelector(
        '[data-tree-section-kind="all-projects"]'
      );
      const repositoryItems = Array.from(
        allProjectsSection?.querySelectorAll<HTMLButtonElement>(
          '[data-tree-navigation-item="repository"]'
        ) ?? []
      );
      const secondRepository = repositoryItems[1];
      expect(secondRepository?.getAttribute('aria-expanded')).toBe('false');

      await act(async () => {
        secondRepository?.focus();
        secondRepository?.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })
        );
      });

      expect(document.activeElement).toBe(secondRepository);
    } finally {
      view.unmount();
    }
  });

  it('shows a compact worktree status with a direct create action', async () => {
    const view = await mountTreeSidebar({
      repositories: [
        {
          id: 'repo-empty',
          name: 'Repo Empty',
          path: '/repo-empty',
          groupId: undefined,
        },
      ],
      selectedRepo: '/repo-empty',
      activeWorktree: null,
      worktrees: [],
    });

    try {
      const disclosure = view.container.querySelector<HTMLButtonElement>(
        'button[aria-label="Expand repository worktrees"]'
      );
      if (disclosure) {
        await act(async () => {
          disclosure.click();
        });
      }

      const emptyState = view.container.querySelector(
        '.control-tree-inline-empty[data-has-icon="true"]'
      );
      const emptyStateIcon = emptyState?.querySelector('.control-tree-inline-icon');
      const emptyStateTitle = emptyState?.querySelector('.control-tree-inline-title');
      const createWorktreeAction = Array.from(
        emptyState?.querySelectorAll<HTMLButtonElement>('button') ?? []
      ).find((button) => button.textContent?.includes('New Worktree'));

      expect(emptyStateIcon?.getAttribute('aria-hidden')).toBe('true');
      expect(emptyStateIcon?.querySelector('svg')).not.toBeNull();
      expect(emptyStateTitle?.textContent).toBe('No worktrees');
      expect(emptyState?.textContent).toContain('No worktrees');
      expect(createWorktreeAction).toBeDefined();
      expect(createWorktreeAction?.getAttribute('aria-label')).toBe('New Worktree');
      expect(createWorktreeAction?.getAttribute('title')).toBe('New Worktree');
    } finally {
      view.unmount();
    }
  });

  it('opens worktree creation after selecting a different empty repository', async () => {
    const onSelectRepo = vi.fn();
    const onRefresh = vi.fn();
    const repositories = [
      {
        id: 'repo-a',
        name: 'Repo A',
        path: '/repo-a',
        groupId: undefined,
      },
      {
        id: 'repo-empty',
        name: 'Repo Empty',
        path: '/repo-empty',
        groupId: undefined,
      },
    ];
    const branches = [
      {
        name: 'main',
        current: true,
        commit: 'abc123',
        label: 'main',
        merged: false,
      },
    ];
    const view = await mountTreeSidebar({ repositories, onSelectRepo, onRefresh, branches });

    try {
      const emptyRepositoryButton = Array.from(
        view.container.querySelectorAll<HTMLButtonElement>('.control-tree-primary')
      ).find((button) => button.textContent?.includes('Repo Empty'));
      const emptyRepositoryContainer =
        emptyRepositoryButton?.closest('.control-tree-node')?.parentElement?.parentElement;
      const disclosure = emptyRepositoryContainer?.querySelector<HTMLButtonElement>(
        'button[aria-label="Expand repository worktrees"]'
      );

      await act(async () => {
        disclosure?.click();
      });

      const newWorktreeButton = Array.from(
        emptyRepositoryContainer?.querySelectorAll<HTMLButtonElement>('button') ?? []
      ).find((button) => button.textContent?.includes('New Worktree'));
      expect(newWorktreeButton).toBeDefined();

      await act(async () => {
        newWorktreeButton?.click();
      });
      expect(onSelectRepo).toHaveBeenCalledWith('/repo-empty', { activateRemote: true });

      vi.useFakeTimers();
      await view.rerender({
        selectedRepo: '/repo-empty',
        activeWorktree: null,
        worktrees: [],
        branches,
      });
      await act(async () => {
        vi.runAllTimers();
      });

      expect(view.container.querySelector('[data-create-worktree-submit="true"]')).not.toBeNull();
      expect(onRefresh).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      view.unmount();
    }
  });

  it('does not keep a worktree visible when only a child-directory agent session exists', async () => {
    agentSessionsState.sessions = [
      agentSession({
        id: 'nested-workdir-session',
        cwd: '/repo-a/agent-task/packages/ui',
      }),
    ];
    agentSessionsState.runtimeStates = {
      'nested-workdir-session': runtimeState({ outputState: 'idle' }),
    };

    const view = await mountTreeSidebar({ activeWorktree: null });

    try {
      const toggle = view.container.querySelector(
        'button[title="Only show live Agent sessions"]'
      ) as HTMLButtonElement | null;

      await act(async () => {
        toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(view.container.querySelector('[data-worktree-item="/repo-a/agent-task"]')).toBeNull();
      expect(view.container.querySelector('[data-worktree-item="/repo-a/main"]')).toBeNull();
      expect(view.container.textContent).toContain('No live Agent worktrees');
    } finally {
      view.unmount();
    }
  });

  it('offers a direct way to clear the agent filter when no worktrees match', async () => {
    agentSessionsState.sessions = [agentSession({ id: 'repo-a-session', cwd: '/repo-a/missing' })];
    agentSessionsState.runtimeStates = {
      'repo-a-session': runtimeState({ outputState: 'idle' }),
    };

    const view = await mountTreeSidebar({ activeWorktree: null });

    try {
      const toggle = view.container.querySelector(
        'button[title="Only show live Agent sessions"]'
      ) as HTMLButtonElement | null;

      await act(async () => {
        toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(view.container.textContent).toContain('No live Agent worktrees');
      expect(view.container.textContent).toContain(
        'This repository has no worktree with a live Agent session.'
      );

      const clearButton = Array.from(view.container.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('Show all worktrees')
      );

      expect(clearButton).not.toBeNull();

      await act(async () => {
        clearButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(view.container.querySelector('[data-worktree-item="/repo-a/main"]')).not.toBeNull();
      expect(
        view.container.querySelector('[data-worktree-item="/repo-a/agent-task"]')
      ).not.toBeNull();
    } finally {
      view.unmount();
    }
  });

  it('keeps the agent-filter empty copy aligned with indented worktree rows', async () => {
    agentSessionsState.sessions = [agentSession({ id: 'repo-a-session', cwd: '/repo-a/missing' })];
    agentSessionsState.runtimeStates = {
      'repo-a-session': runtimeState({ outputState: 'idle' }),
    };

    const view = await mountTreeSidebar({ activeWorktree: null });

    try {
      const toggle = view.container.querySelector(
        'button[title="Only show live Agent sessions"]'
      ) as HTMLButtonElement | null;

      await act(async () => {
        toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      const emptyState = Array.from(
        view.container.querySelectorAll('.control-tree-inline-empty')
      ).find((element) => element.textContent?.includes('No live Agent worktrees'));
      expect(emptyState?.textContent).toContain('No live Agent worktrees');
      expect(emptyState?.parentElement?.classList.contains('control-tree-guide-item')).toBe(true);
      expect(
        emptyState?.parentElement?.classList.contains('control-tree-guide-item-worktree')
      ).toBe(true);
    } finally {
      view.unmount();
    }
  });

  it('filters by open initialized agent sessions instead of runtime output state', async () => {
    worktreeActivityState.activities = {
      '/repo-a/main': { agentCount: 1, terminalCount: 0 },
      '/repo-a/agent-task': { agentCount: 0, terminalCount: 0 },
      '/repo-b/main': { agentCount: 0, terminalCount: 0 },
      '/tmp/temp-agent': { agentCount: 0, terminalCount: 0 },
      '/tmp/temp-idle': { agentCount: 0, terminalCount: 0 },
    };
    agentSessionsState.sessions = [
      agentSession({ id: 'idle-session', cwd: '/repo-a/main' }),
      agentSession({ id: 'draft-session', cwd: '/repo-a/agent-task', initialized: false }),
    ];
    agentSessionsState.runtimeStates = {
      'idle-session': runtimeState({ outputState: 'idle' }),
      'draft-session': runtimeState({ outputState: 'outputting' }),
    };

    const view = await mountTreeSidebar({ activeWorktree: null });

    try {
      const toggle = view.container.querySelector(
        'button[title="Only show live Agent sessions"]'
      ) as HTMLButtonElement | null;

      await act(async () => {
        toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(view.container.querySelector('[data-worktree-item="/repo-a/main"]')).not.toBeNull();
      expect(view.container.querySelector('[data-worktree-item="/repo-a/agent-task"]')).toBeNull();
    } finally {
      view.unmount();
    }
  });

  it('keeps repositories visible while worktrees prefetch when an open agent session is known', async () => {
    agentSessionsState.sessions = [
      agentSession({ id: 'repo-b-session', cwd: '/repo-b/main', repoPath: '/repo-b' }),
    ];
    agentSessionsState.runtimeStates = {
      'repo-b-session': runtimeState({ outputState: 'idle' }),
    };
    useWorktreeListMultipleMock.mockImplementation((inputs: WorktreeListInput[]) => {
      const requestedRepoPaths = inputs.map((input: WorktreeListInput) =>
        typeof input === 'string' ? input : input.repoPath
      );

      return {
        worktreesMap: requestedRepoPaths.includes('/repo-a')
          ? { '/repo-a': repoWorktrees['/repo-a'] }
          : {},
        errorsMap: {},
        loadingMap: requestedRepoPaths.includes('/repo-b') ? { '/repo-b': true } : {},
        refetchAll: vi.fn(),
      };
    });

    const view = await mountTreeSidebar({ activeWorktree: null });

    try {
      const toggle = view.container.querySelector(
        'button[title="Only show live Agent sessions"]'
      ) as HTMLButtonElement | null;

      await act(async () => {
        toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(view.container.textContent).toContain('Repo B');
    } finally {
      view.unmount();
    }
  });

  it('hides the active worktree under the agent filter when it has no live agent session', async () => {
    agentSessionsState.sessions = [];
    agentSessionsState.runtimeStates = {};
    worktreeActivityState.activities = {
      '/repo-a/main': { agentCount: 0, terminalCount: 0 },
      '/repo-a/agent-task': { agentCount: 0, terminalCount: 0 },
      '/repo-b/main': { agentCount: 0, terminalCount: 0 },
      '/tmp/temp-agent': { agentCount: 0, terminalCount: 0 },
      '/tmp/temp-idle': { agentCount: 0, terminalCount: 0 },
    };

    const view = await mountTreeSidebar({
      activeWorktree: repoWorktrees['/repo-a'][0],
    });

    try {
      const toggle = view.container.querySelector(
        'button[title="Only show live Agent sessions"]'
      ) as HTMLButtonElement | null;

      await act(async () => {
        toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(view.container.querySelector('[data-worktree-item="/repo-a/main"]')).toBeNull();
      expect(view.container.textContent).not.toContain('Repo A');
    } finally {
      view.unmount();
    }
  });

  it('hides the active worktree when only dead recovered agent sessions remain', async () => {
    agentSessionsState.sessions = [
      agentSession({
        id: 'dead-recovered-session',
        cwd: '/repo-a/main',
        recoveryState: 'dead',
      }),
    ];
    agentSessionsState.runtimeStates = {
      'dead-recovered-session': runtimeState({ outputState: 'idle' }),
    };
    worktreeActivityState.activities = {
      '/repo-a/main': { agentCount: 1, terminalCount: 0 },
      '/repo-a/agent-task': { agentCount: 0, terminalCount: 0 },
      '/repo-b/main': { agentCount: 0, terminalCount: 0 },
      '/tmp/temp-agent': { agentCount: 0, terminalCount: 0 },
      '/tmp/temp-idle': { agentCount: 0, terminalCount: 0 },
    };

    const view = await mountTreeSidebar({
      activeWorktree: repoWorktrees['/repo-a'][0],
    });

    try {
      const toggle = view.container.querySelector(
        'button[title="Only show live Agent sessions"]'
      ) as HTMLButtonElement | null;

      await act(async () => {
        toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(view.container.querySelector('[data-worktree-item="/repo-a/main"]')).toBeNull();
      expect(view.container.textContent).not.toContain('Repo A');
    } finally {
      view.unmount();
    }
  });

  it('triggers worktree prefetch for non-expanded repos when the agent filter is enabled', async () => {
    const view = await mountTreeSidebar();

    try {
      useWorktreeListMultipleMock.mockClear();

      const toggle = view.container.querySelector(
        'button[title="Only show live Agent sessions"]'
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

  it('does not keep a newly created worktree visible until it has an open agent session', async () => {
    const onCreateWorktree = vi.fn(async () => undefined);
    const view = await mountTreeSidebar({ onCreateWorktree });

    try {
      const toggle = view.container.querySelector(
        'button[title="Only show live Agent sessions"]'
      ) as HTMLButtonElement | null;

      await act(async () => {
        toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      const repoActionsButton = view.container.querySelector(
        'button[title="Repository actions"]'
      ) as HTMLButtonElement | null;

      await act(async () => {
        repoActionsButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      const repositoryMenu = document.querySelector(
        '[role="menu"][aria-label="Repository actions"]'
      );
      expect(repositoryMenu).not.toBeNull();
      expect(view.container.contains(repositoryMenu)).toBe(false);

      const newWorktreeButton = Array.from(repositoryMenu?.querySelectorAll('button') ?? []).find(
        (button) => button.textContent?.includes('New Worktree')
      );

      await act(async () => {
        newWorktreeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      const submitButton = view.container.querySelector(
        'button[data-create-worktree-submit="true"]'
      ) as HTMLButtonElement | null;

      expect(submitButton).not.toBeNull();

      await act(async () => {
        submitButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(onCreateWorktree).toHaveBeenCalledWith({
        path: '/repo-a/new-agent-task',
        branch: 'main',
        newBranch: 'new-agent-task',
      });
      expect(
        view.container.querySelector('[data-worktree-item="/repo-a/new-agent-task"]')
      ).toBeNull();
      expect(view.container.querySelector('[data-worktree-item="/repo-a/main"]')).toBeNull();
    } finally {
      view.unmount();
    }
  });

  it('keeps a collapsed matching repository collapsed when the agent filter is active', async () => {
    agentSessionsState.sessions = [
      agentSession({ id: 'repo-b-session', cwd: '/repo-b/main', repoPath: '/repo-b' }),
    ];
    agentSessionsState.runtimeStates = {
      'repo-b-session': runtimeState({ outputState: 'idle' }),
    };

    const view = await mountTreeSidebar({ activeWorktree: null });

    try {
      const toggle = view.container.querySelector(
        'button[title="Only show live Agent sessions"]'
      ) as HTMLButtonElement | null;

      await act(async () => {
        toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      const repoBRow = Array.from(view.container.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('Repo B')
      );
      expect(repoBRow).not.toBeNull();

      const repoBContainer = repoBRow?.closest('.relative');
      const disclosure = repoBContainer?.querySelector(
        'button[title="Expand"]'
      ) as HTMLButtonElement | null;
      expect(disclosure).not.toBeNull();
      expect(view.container.querySelector('[data-worktree-item="/repo-b/main"]')).toBeNull();

      await act(async () => {
        disclosure?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(view.container.querySelector('[data-worktree-item="/repo-b/main"]')).not.toBeNull();
    } finally {
      view.unmount();
    }
  });

  it('does not show worktree empty states for collapsed repositories under the agent filter', async () => {
    agentSessionsState.sessions = [agentSession({ id: 'repo-a-session', cwd: '/repo-a/missing' })];
    agentSessionsState.runtimeStates = {
      'repo-a-session': runtimeState({ outputState: 'idle' }),
    };

    const view = await mountTreeSidebar({ activeWorktree: null });

    try {
      const repoARow = Array.from(view.container.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('Repo A')
      );
      expect(repoARow).not.toBeNull();

      const repoAContainer = repoARow?.closest('.relative');
      const collapseButton = repoAContainer?.querySelector(
        'button[title="Collapse"]'
      ) as HTMLButtonElement | null;
      expect(collapseButton).not.toBeNull();

      await act(async () => {
        collapseButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      const toggle = view.container.querySelector(
        'button[title="Only show live Agent sessions"]'
      ) as HTMLButtonElement | null;

      await act(async () => {
        toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(view.container.textContent).toContain('Repo A');
      expect(view.container.textContent).not.toContain('No live Agent worktrees');
      expect(view.container.textContent).not.toContain('No matching worktrees');
    } finally {
      view.unmount();
    }
  });

  it('registers a collapsed diff stat scope without requesting stats directly', async () => {
    shouldPollValue = true;
    const view = await mountTreeSidebar({ collapsed: true });

    try {
      expect(worktreeActivityState.registerDiffStatsScope).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          collapsed: true,
          enabled: true,
        })
      );
      expect(worktreeActivityState.fetchDiffStats).not.toHaveBeenCalled();
    } finally {
      view.unmount();
    }
  });

  it('re-expands the selected repository when its active worktree changes', async () => {
    const view = await mountTreeSidebar();

    try {
      const disclosure = view.container.querySelector(
        'button[aria-controls="tree-worktrees--repo-a"]'
      ) as HTMLButtonElement | null;

      await act(async () => {
        disclosure?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(disclosure?.getAttribute('aria-expanded')).toBe('false');

      await view.rerender({
        activeWorktree: repoWorktrees['/repo-a'][0],
      });

      expect(disclosure?.getAttribute('aria-expanded')).toBe('true');
      expect(view.container.querySelector('[data-worktree-item="/repo-a/main"]')).not.toBeNull();
    } finally {
      view.unmount();
    }
  });

  it('aligns a specific group when an external worktree selection changes repository context', async () => {
    const onSwitchGroup = vi.fn();
    const view = await mountTreeSidebar({
      repositories: [
        { id: 'repo-a', name: 'Repo A', path: '/repo-a', groupId: 'group-a' },
        { id: 'repo-b', name: 'Repo B', path: '/repo-b', groupId: 'group-b' },
      ],
      selectedRepo: '/repo-b',
      activeWorktree: repoWorktrees['/repo-b'][0],
      worktrees: repoWorktrees['/repo-b'],
      groups: [
        { id: 'group-a', name: 'Group A', emoji: 'A', color: '#111111', order: 0 },
        { id: 'group-b', name: 'Group B', emoji: 'B', color: '#222222', order: 1 },
      ],
      activeGroupId: 'group-a',
      onSwitchGroup,
    });

    try {
      expect(onSwitchGroup).toHaveBeenCalledWith('group-b');
    } finally {
      view.unmount();
    }
  });

  it('offers a direct create action for an expanded repository without worktrees', async () => {
    const view = await mountTreeSidebar({
      repositories: [{ id: 'repo-empty', name: 'Empty Repo', path: '/repo-empty' }],
      selectedRepo: '/repo-empty',
      activeWorktree: null,
      worktrees: [],
    });

    try {
      const createButton = Array.from(view.container.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'New Worktree'
      );

      expect(createButton).toBeDefined();

      await act(async () => {
        createButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(
        view.container.querySelector('button[data-create-worktree-submit="true"]')
      ).not.toBeNull();
    } finally {
      view.unmount();
    }
  });

  it('registers visible worktrees for the app-level diff stat scheduler when expanded', async () => {
    shouldPollValue = true;
    const view = await mountTreeSidebar({ collapsed: false });

    try {
      expect(worktreeActivityState.registerDiffStatsScope).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          collapsed: false,
          enabled: true,
          visiblePaths: expect.arrayContaining(['/repo-a/main', '/repo-a/agent-task']),
        })
      );
    } finally {
      view.unmount();
    }
  });
});
