/* @vitest-environment jsdom */

import type { GitWorktree } from '@shared/types';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Repository, RepositoryGroup, TabId } from '@/App/constants';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const connectRemote = vi.fn(() => Promise.resolve());
const listWorktrees = vi.fn(async () => []);
const queryClientGetQueryData = vi.fn(() => []);
const queryClientInvalidateQueries = vi.fn();

const openSettings = vi.fn();
const toggleSettings = vi.fn();
const setSettingsCategory = vi.fn();
const setScrollToProvider = vi.fn();
const setPendingProviderAction = vi.fn();
const handleSettingsCategoryChange = vi.fn();
const handleSettingsDialogOpenChange = vi.fn();
const confirmCloseAndRespond = vi.fn();
const cancelCloseAndRespond = vi.fn();
const handleSelectWorktree = vi.fn(async () => {});
const handleOpenMergeDialog = vi.fn();
const refetchWorktrees = vi.fn(async () => []);
const refetchBranches = vi.fn(async () => []);
const createWorktreeMutateAsync = vi.fn(async () => ({}));
const removeWorktreeMutateAsync = vi.fn(async () => ({}));
const gitInitMutateAsync = vi.fn(async () => ({}));
const mergeMutateAsync = vi.fn(async () => ({ success: true, merged: true }));
const resolveConflictMutateAsync = vi.fn(async () => ({}));
const abortMergeMutateAsync = vi.fn(async () => ({}));
const continueMergeMutateAsync = vi.fn(async () => ({}));
const handleCreateTempWorkspace = vi.fn();
const handleRemoveTempWorkspace = vi.fn();
const handleSelectTempWorkspace = vi.fn();
const renameTempWorkspace = vi.fn();
const rehydrateTempWorkspaces = vi.fn();
const openTempRename = vi.fn();
const openTempDelete = vi.fn();
const setPendingScript = vi.fn();
const setAgentActiveId = vi.fn();
const clearEditorWorktreeState = vi.fn();
const clearWorktreeActivity = vi.fn();
const closeAgentSessions = vi.fn();
const closeTerminalSessions = vi.fn();
const setWorktreeError = vi.fn();
const addToast = vi.fn();
const toastAdd = vi.fn(() => 'toast-id');
const toastClose = vi.fn();
const handleResizeStart = vi.fn(() => vi.fn());
const handleReorderTabs = vi.fn();
const handleReorderRepositories = vi.fn();
const handleReorderWorktrees = vi.fn();
const saveRepositories = vi.fn();
const setSelectedRepoState = vi.fn();
const setActiveGroupId = vi.fn();
const setWorktreeTabMap = vi.fn();
const setRepoWorktreeMap = vi.fn();
const setActiveTab = vi.fn();
const setPreviousTab = vi.fn();
const setActiveWorktree = vi.fn();
const saveActiveWorktreeToMap = vi.fn();
const setRepositoryCollapsed = vi.fn();
const setWorktreeCollapsed = vi.fn();
const setAddRepoDialogOpen = vi.fn();
const setInitialLocalPath = vi.fn();
const setActionPanelOpen = vi.fn();
const setCloseDialogOpen = vi.fn();
const handleCreateGroup = vi.fn();
const handleUpdateGroup = vi.fn();
const handleDeleteGroup = vi.fn();
const handleSwitchGroup = vi.fn();
const handleMoveToGroup = vi.fn();

const WORKTREE: GitWorktree = {
  path: '/repo/.worktrees/feature-a',
  branch: 'feature-a',
  head: 'abc123',
  isMainWorktree: false,
  isLocked: false,
  prunable: false,
};

const GROUPS: RepositoryGroup[] = [];
const REPOSITORIES: Repository[] = [
  {
    id: 'repo-local',
    name: 'repo',
    path: '/repo',
    kind: 'local',
  },
];

const repoState = {
  repositories: REPOSITORIES,
  selectedRepo: '/repo',
  groups: GROUPS,
  activeGroupId: '__all__',
  setSelectedRepo: setSelectedRepoState,
  setActiveGroupId,
  saveRepositories,
  handleCreateGroup,
  handleUpdateGroup,
  handleDeleteGroup,
  handleSwitchGroup,
  handleMoveToGroup,
  handleReorderRepositories,
};

const wtState: {
  activeTab: TabId;
  previousTab: TabId | null;
  activeWorktree: GitWorktree | null;
  worktreeTabMap: Record<string, TabId>;
  repoWorktreeMap: Record<string, string>;
  tabOrder: TabId[];
  currentWorktreePathRef: { current: string | null };
} = {
  activeTab: 'file',
  previousTab: null,
  activeWorktree: WORKTREE,
  worktreeTabMap: {
    [WORKTREE.path]: 'file',
  },
  repoWorktreeMap: {
    '/repo': WORKTREE.path,
  },
  tabOrder: ['chat', 'file', 'terminal', 'source-control', 'todo'],
  currentWorktreePathRef: { current: WORKTREE.path },
};

const panelState = {
  repositoryCollapsed: false,
  worktreeCollapsed: false,
  addRepoDialogOpen: false,
  initialLocalPath: null as string | null,
  actionPanelOpen: false,
  closeDialogOpen: false,
  toggleSelectedRepoExpandedRef: { current: undefined as (() => void) | undefined },
  switchWorktreePathRef: { current: undefined as ((path: string) => Promise<void>) | undefined },
  setRepositoryCollapsed,
  setWorktreeCollapsed,
  setAddRepoDialogOpen,
  setInitialLocalPath,
  setActionPanelOpen,
  setCloseDialogOpen,
};

const settingsState = {
  settingsCategory: 'general',
  scrollToProvider: null as string | null,
  pendingProviderAction: null as 'preview' | 'save' | null,
  settingsDialogOpen: false,
  settingsDisplayMode: 'tab' as const,
  setSettingsCategory,
  setScrollToProvider,
  setPendingProviderAction,
  openSettings,
  toggleSettings,
  handleSettingsCategoryChange,
  handleSettingsDialogOpenChange,
};

const settingsStoreState = {
  layoutMode: 'tree' as const,
  autoUpdateEnabled: true,
  hideGroups: false,
  temporaryWorkspaceEnabled: true,
  fileTreeDisplayMode: 'legacy' as const,
  defaultTemporaryPath: '',
};

const worktreeActivityState = {
  activities: {} as Record<string, { agentCount: number; terminalCount: number }>,
  closeAgentSessions,
  closeTerminalSessions,
  clearWorktree: clearWorktreeActivity,
};

function mockStatefulUpdater<T>(updater: T | ((previous: T) => T), previous: T): T {
  return typeof updater === 'function' ? (updater as (value: T) => T)(previous) : updater;
}

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    getQueryData: queryClientGetQueryData,
    invalidateQueries: queryClientInvalidateQueries,
  }),
}));

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  motion: {
    div: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) =>
      React.createElement('div', props, children),
  },
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string) => value,
  }),
}));

vi.mock('../hooks', () => ({
  useAgentSessionNotifications: vi.fn(),
  useAppLifecycle: () => ({
    confirmCloseAndRespond,
    cancelCloseAndRespond,
  }),
  useBackgroundImage: vi.fn(),
  useClaudeIntegration: vi.fn(),
  useClaudeProviderListener: vi.fn(),
  useCodeReviewContinue: vi.fn(),
  useFileDragDrop: () => ({
    isFileDragOver: false,
    repositorySidebarRef: { current: null },
  }),
  useGroupSync: vi.fn(),
  useMenuActions: vi.fn(),
  useMergeState: () => ({
    mergeDialogOpen: false,
    mergeWorktree: null,
    mergeConflicts: null,
    pendingMergeOptions: null,
    setMergeDialogOpen: vi.fn(),
    setMergeConflicts: vi.fn(),
    setPendingMergeOptions: vi.fn(),
    handleOpenMergeDialog,
  }),
  useOpenPathListener: vi.fn(),
  usePanelState: () => panelState,
  useRepositoryState: () => repoState,
  useSettingsEvents: vi.fn(),
  useSettingsState: () => settingsState,
  useStartupAgentSessionRecovery: vi.fn(),
  useTempWorkspaceActions: () => ({
    handleSelectTempWorkspace,
    handleCreateTempWorkspace,
    handleRemoveTempWorkspace,
  }),
  useTempWorkspaceSync: vi.fn(),
  useTerminalNavigation: vi.fn(),
  useWorktreeSelection: () => ({
    handleSelectWorktree,
  }),
  useWorktreeState: () => ({
    worktreeTabMap: wtState.worktreeTabMap,
    repoWorktreeMap: wtState.repoWorktreeMap,
    tabOrder: wtState.tabOrder,
    activeTab: wtState.activeTab,
    previousTab: wtState.previousTab,
    activeWorktree: wtState.activeWorktree,
    currentWorktreePathRef: wtState.currentWorktreePathRef,
    setWorktreeTabMap,
    setRepoWorktreeMap,
    setActiveTab,
    setPreviousTab,
    setActiveWorktree,
    handleReorderWorktrees,
    handleReorderTabs,
    getSortedWorktrees: (_repoPath: string | null, worktrees: GitWorktree[]) => worktrees,
    saveActiveWorktreeToMap,
  }),
  useWorktreeSync: vi.fn(),
}));

vi.mock('../useAppKeyboardShortcuts', () => ({
  useAppKeyboardShortcuts: vi.fn(),
}));

vi.mock('../usePanelResize', () => ({
  usePanelResize: () => ({
    repositoryWidth: 240,
    worktreeWidth: 280,
    treeSidebarWidth: 320,
    fileSidebarWidth: 256,
    resizing: false,
    handleResizeStart,
  }),
}));

vi.mock('../../components/layout/BackgroundLayer', () => ({
  BackgroundLayer: () => React.createElement('div', { 'data-testid': 'background-layer' }),
}));

vi.mock('../../components/layout/DeferredMainContent', () => ({
  DeferredMainContent: ({
    onStartupBlockingReady,
  }: {
    onStartupBlockingReady: (key: 'file-panel') => void;
  }) =>
    React.createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'main-content-ready',
        onClick: () => onStartupBlockingReady('file-panel'),
      },
      'main-content-ready'
    ),
}));

vi.mock('../../components/layout/DeferredRepositorySidebar', () => ({
  DeferredRepositorySidebar: () =>
    React.createElement('div', { 'data-testid': 'repository-sidebar' }),
}));

vi.mock('../../components/layout/DeferredTreeSidebar', () => ({
  DeferredTreeSidebar: ({ onReady }: { onReady: () => void }) =>
    React.createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'tree-sidebar-ready',
        onClick: onReady,
      },
      'tree-sidebar-ready'
    ),
}));

vi.mock('../../components/layout/DeferredWorktreePanel', () => ({
  DeferredWorktreePanel: () => React.createElement('div', { 'data-testid': 'worktree-panel' }),
}));

vi.mock('../../components/layout/TemporaryWorkspacePanel', () => ({
  TemporaryWorkspacePanel: () =>
    React.createElement('div', { 'data-testid': 'temporary-workspace-panel' }),
}));

vi.mock('../../components/layout/WindowTitleBar', () => ({
  WindowTitleBar: ({ onOpenSettings }: { onOpenSettings: () => void }) =>
    React.createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'open-settings',
        onClick: onOpenSettings,
      },
      'open-settings'
    ),
}));

vi.mock('../../components/DevToolsOverlay', () => ({
  DevToolsOverlay: () => React.createElement('div', { 'data-testid': 'devtools-overlay' }),
}));

vi.mock('../../components/files/FileSidebar', () => ({
  FileSidebar: ({ onSwitchTab }: { onSwitchTab: () => void }) =>
    React.createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'switch-file-tab',
        onClick: onSwitchTab,
      },
      'switch-file-tab'
    ),
}));

vi.mock('../../components/StartupShell', () => ({
  StartupShell: ({
    title,
    progressValue,
    progressMax,
  }: {
    title: string;
    progressValue: number;
    progressMax: number;
  }) =>
    React.createElement(
      'div',
      {
        'data-testid': 'startup-shell',
        'data-progress': `${progressValue}/${progressMax}`,
      },
      title
    ),
}));

vi.mock('../../App/AppOverlays', () => ({
  AppOverlays: ({
    onAddLocalRepository,
  }: {
    onAddLocalRepository: (path: string, groupId: string | null) => void;
  }) =>
    React.createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'add-local-repo',
        onClick: () => onAddLocalRepository('/repo-added', null),
      },
      'add-local-repo'
    ),
}));

vi.mock('../../hooks/useGit', () => ({
  useAutoFetchListener: vi.fn(),
  useGitBranches: () => ({
    data: ['main', 'feature-a'],
    refetch: refetchBranches,
  }),
  useGitInit: () => ({
    mutateAsync: gitInitMutateAsync,
  }),
}));

vi.mock('../../hooks/useWebInspector', () => ({
  useWebInspector: vi.fn(),
}));

vi.mock('../../hooks/useWorktree', () => ({
  useWorktreeCreate: () => ({
    isPending: false,
    mutateAsync: createWorktreeMutateAsync,
  }),
  useWorktreeList: () => ({
    data: [WORKTREE],
    isLoading: false,
    isFetching: false,
    isFetched: true,
    refetch: refetchWorktrees,
  }),
  useWorktreeMerge: () => ({
    isPending: false,
    mutateAsync: mergeMutateAsync,
  }),
  useWorktreeMergeAbort: () => ({
    mutateAsync: abortMergeMutateAsync,
  }),
  useWorktreeMergeContinue: () => ({
    mutateAsync: continueMergeMutateAsync,
  }),
  useWorktreeRemove: () => ({
    mutateAsync: removeWorktreeMutateAsync,
  }),
  useWorktreeResolveConflict: () => ({
    mutateAsync: resolveConflictMutateAsync,
  }),
}));

vi.mock('../../stores/agentSessions', () => ({
  useAgentSessionsStore: (selector: (state: { setActiveId: typeof setAgentActiveId }) => unknown) =>
    selector({
      setActiveId: setAgentActiveId,
    }),
}));

vi.mock('../../stores/agentStatus', () => ({
  initAgentStatusListener: () => vi.fn(),
}));

vi.mock('../../stores/cloneTasks', () => ({
  initCloneProgressListener: () => vi.fn(),
}));

vi.mock('../../stores/editor', () => ({
  useEditorStore: (
    selector: (state: {
      activeTabPath: string | null;
      currentWorktreePath: string | null;
      clearWorktreeState: typeof clearEditorWorktreeState;
    }) => unknown
  ) =>
    selector({
      activeTabPath: '/repo/src/index.ts',
      currentWorktreePath: WORKTREE.path,
      clearWorktreeState: clearEditorWorktreeState,
    }),
}));

vi.mock('../../stores/initScript', () => ({
  useInitScriptStore: (
    selector: (state: { setPendingScript: typeof setPendingScript }) => unknown
  ) =>
    selector({
      setPendingScript,
    }),
}));

vi.mock('../../stores/settings', () => ({
  useSettingsStore: (selector: (state: typeof settingsStoreState) => unknown) =>
    selector(settingsStoreState),
}));

vi.mock('../../stores/tempWorkspace', () => ({
  useTempWorkspaceStore: (
    selector: (state: {
      items: [];
      addItem: typeof handleCreateTempWorkspace;
      removeItem: typeof handleRemoveTempWorkspace;
      renameItem: typeof renameTempWorkspace;
      rehydrate: typeof rehydrateTempWorkspaces;
      openRename: typeof openTempRename;
      openDelete: typeof openTempDelete;
    }) => unknown
  ) =>
    selector({
      items: [],
      addItem: handleCreateTempWorkspace,
      removeItem: handleRemoveTempWorkspace,
      renameItem: renameTempWorkspace,
      rehydrate: rehydrateTempWorkspaces,
      openRename: openTempRename,
      openDelete: openTempDelete,
    }),
}));

vi.mock('../../stores/worktree', () => ({
  useWorktreeStore: (
    selector: (state: { error: string | null; setError: typeof setWorktreeError }) => unknown
  ) =>
    selector({
      error: null,
      setError: setWorktreeError,
    }),
}));

vi.mock('../../stores/worktreeActivity', () => {
  const store = Object.assign(
    (selector: (state: typeof worktreeActivityState) => unknown) => selector(worktreeActivityState),
    {
      getState: () => worktreeActivityState,
    }
  );

  return {
    initAgentActivityListener: () => vi.fn(),
    useWorktreeActivityStore: store,
  };
});

vi.mock('../../components/ui/toast', () => ({
  addToast,
  toastManager: {
    add: toastAdd,
    close: toastClose,
  },
}));

vi.mock('../../lib/electronEnvironment', () => ({
  getRendererEnvironment: () => ({
    HOME: '/Users/tester',
    platform: 'darwin',
  }),
}));

function click(container: HTMLElement, selector: string) {
  const target = container.querySelector<HTMLElement>(selector);
  expect(target).not.toBeNull();
  target?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function getRenderedContainer(container: HTMLDivElement | null): HTMLDivElement {
  expect(container).not.toBeNull();
  if (!container) {
    throw new Error('Expected app container to be rendered');
  }
  return container;
}

async function renderApp() {
  const { default: App } = await import('../../App');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(React.createElement(App));
    await Promise.resolve();
  });

  return { container, root };
}

describe('App integration', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    vi.clearAllMocks();

    repoState.repositories = [...REPOSITORIES];
    repoState.selectedRepo = '/repo';
    repoState.groups = GROUPS;
    repoState.activeGroupId = '__all__';

    wtState.activeTab = 'file';
    wtState.previousTab = null;
    wtState.activeWorktree = WORKTREE;
    wtState.worktreeTabMap = { [WORKTREE.path]: 'file' };
    wtState.repoWorktreeMap = { '/repo': WORKTREE.path };
    wtState.tabOrder = ['chat', 'file', 'terminal', 'source-control', 'todo'];
    wtState.currentWorktreePathRef = { current: WORKTREE.path };

    panelState.repositoryCollapsed = false;
    panelState.worktreeCollapsed = false;
    panelState.addRepoDialogOpen = false;
    panelState.initialLocalPath = null;
    panelState.actionPanelOpen = false;
    panelState.closeDialogOpen = false;
    panelState.toggleSelectedRepoExpandedRef = { current: undefined };
    panelState.switchWorktreePathRef = { current: undefined };

    settingsState.settingsCategory = 'general';
    settingsState.scrollToProvider = null;
    settingsState.pendingProviderAction = null;
    settingsState.settingsDialogOpen = false;
    settingsState.settingsDisplayMode = 'tab';

    settingsStoreState.layoutMode = 'tree';
    settingsStoreState.fileTreeDisplayMode = 'legacy';

    worktreeActivityState.activities = {};

    queryClientGetQueryData.mockReturnValue([]);
    queryClientInvalidateQueries.mockResolvedValue(undefined);

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        remote: {
          connect: connectRemote,
          onStatusChange: () => vi.fn(),
        },
        worktree: {
          list: listWorktrees,
        },
      },
    });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container?.remove();
    root = null;
    container = null;
    Reflect.deleteProperty(window, 'electronAPI');
  });

  it('keeps the startup shell visible until the tree sidebar and file panel report readiness', async () => {
    ({ container, root } = await renderApp());
    const appContainer = getRenderedContainer(container);

    expect(appContainer.querySelector('[data-testid="startup-shell"]')?.textContent).toContain(
      'Loading workspace tree'
    );

    await act(async () => {
      click(appContainer, '[data-testid="tree-sidebar-ready"]');
    });

    expect(appContainer.querySelector('[data-testid="startup-shell"]')).not.toBeNull();

    await act(async () => {
      click(appContainer, '[data-testid="main-content-ready"]');
    });

    expect(appContainer.querySelector('[data-testid="startup-shell"]')).toBeNull();
  });

  it('routes title bar and add-repository actions through the app shell callbacks', async () => {
    ({ container, root } = await renderApp());
    const appContainer = getRenderedContainer(container);

    await act(async () => {
      click(appContainer, '[data-testid="open-settings"]');
    });
    expect(openSettings).toHaveBeenCalledTimes(1);

    await act(async () => {
      click(appContainer, '[data-testid="add-local-repo"]');
    });

    expect(saveRepositories).toHaveBeenCalledTimes(1);
    const savedRepositories = saveRepositories.mock.calls[0]?.[0] as Repository[];
    expect(savedRepositories).toHaveLength(2);
    expect(savedRepositories.some((repo) => repo.path === '/repo-added')).toBe(true);

    expect(setSelectedRepoState).toHaveBeenCalledWith('/repo-added');
    expect(setActiveWorktree).toHaveBeenCalledWith(null);
    expect(setActiveTab).toHaveBeenCalledWith('chat');

    const worktreeTabUpdater = setWorktreeTabMap.mock.calls[0]?.[0] as
      | Record<string, TabId>
      | ((previous: Record<string, TabId>) => Record<string, TabId>);
    const nextTabMap = mockStatefulUpdater(worktreeTabUpdater, { [WORKTREE.path]: 'terminal' });
    expect(nextTabMap[WORKTREE.path]).toBe('file');
  });
});
