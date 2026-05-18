/* @vitest-environment jsdom */

import type { LiveAgentSubagent } from '@shared/types';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TabId } from '@/App/constants';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type SettingsState = {
  settingsDisplayMode: 'tab' | 'draggable-modal';
  setSettingsDisplayMode: (mode: 'tab' | 'draggable-modal') => void;
  fileTreeDisplayMode: 'legacy' | 'current';
  agentSessionDisplayMode: 'tab' | 'canvas' | 'global-canvas';
  chatPanelInactivityThresholdMinutes: number;
  retainSessionBackedChatPanels: boolean;
  todoEnabled: boolean;
  backgroundImageEnabled: boolean;
};

type EditorState = {
  tabs: Array<{ path: string }>;
  currentWorktreePath: string | null;
  worktreeStates: Record<string, { tabs: Array<{ path: string }> }>;
};

type AgentSessionsState = {
  sessions: Array<{
    id: string;
    repoPath: string;
    cwd: string;
    agentId?: string;
    sessionId?: string;
    initialized?: boolean;
  }>;
  activeIds: Record<string, string>;
  runtimeStates: Record<
    string,
    {
      outputState?: 'idle' | 'unread' | 'outputting';
      lastActivityAt?: number;
      hasCompletedTaskUnread?: boolean;
      waitingForInput?: boolean;
    }
  >;
};

type WorktreeActivityState = {
  activities: Record<string, { agentCount: number; terminalCount: number }>;
  activityStates: Record<string, 'idle' | 'running' | 'waiting_input' | 'completed'>;
};

type MainContentModule = typeof import('../MainContent');
type MainContentProps = React.ComponentProps<MainContentModule['MainContent']>;
type MainContentPanelsModule = typeof import('../MainContentPanels');
type MainContentPanelsProps = React.ComponentProps<MainContentPanelsModule['MainContentPanels']>;
type MainContentTopbarModule = typeof import('../MainContentTopbar');
type MainContentTopbarProps = React.ComponentProps<MainContentTopbarModule['MainContentTopbar']>;

const settingsState: SettingsState = {
  settingsDisplayMode: 'tab',
  setSettingsDisplayMode: vi.fn(),
  fileTreeDisplayMode: 'legacy',
  agentSessionDisplayMode: 'tab',
  chatPanelInactivityThresholdMinutes: 5,
  retainSessionBackedChatPanels: true,
  todoEnabled: false,
  backgroundImageEnabled: false,
};

const editorState: EditorState = {
  tabs: [],
  currentWorktreePath: null,
  worktreeStates: {},
};

const agentSessionsState: AgentSessionsState = {
  sessions: [],
  activeIds: {},
  runtimeStates: {},
};

const worktreeActivityState: WorktreeActivityState = {
  activities: {},
  activityStates: {},
};

const liveSubagentsByWorktree = new Map<string, LiveAgentSubagent[]>();
const useLiveSubagentsMock = vi.fn(() => liveSubagentsByWorktree);
const preloadAgentPanelComponentMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
let mockPanelMountId = 0;

function setWindowElectronEnv(
  env?: Partial<{
    platform: 'darwin' | 'win32' | 'linux';
  }>
) {
  if (env) {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        env,
      },
    });
    return;
  }

  Reflect.deleteProperty(window, 'electronAPI');
}

function renderMockPanel(
  panel: string,
  props: Record<string, unknown>,
  extraAttributes?: Record<string, string>
) {
  const mountIdRef = React.useRef<number>(0);
  if (mountIdRef.current === 0) {
    mockPanelMountId += 1;
    mountIdRef.current = mockPanelMountId;
  }

  const workspaceCanvasWorktrees = Array.isArray(props.workspaceCanvasWorktrees)
    ? props.workspaceCanvasWorktrees
    : [];

  return React.createElement('div', {
    'data-panel': panel,
    'data-mount-id': String(mountIdRef.current),
    'data-active': String(props.isActive ?? false),
    'data-tree-enabled': String(props.treeEnabled ?? ''),
    'data-workspace-canvas-worktree-count': String(workspaceCanvasWorktrees.length),
    'data-workspace-canvas-worktrees': workspaceCanvasWorktrees
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return '';
        }

        const candidate = item as { repoPath?: unknown; worktreePath?: unknown };
        return typeof candidate.repoPath === 'string' && typeof candidate.worktreePath === 'string'
          ? `${candidate.repoPath}::${candidate.worktreePath}`
          : '';
      })
      .filter(Boolean)
      .join('|'),
    'data-canvas-recenter-token':
      typeof props.canvasRecenterOnActivateToken === 'number'
        ? String(props.canvasRecenterOnActivateToken)
        : '',
    'data-canvas-recenter-worktree-path':
      typeof props.canvasRecenterWorktreePath === 'string' ? props.canvasRecenterWorktreePath : '',
    'data-canvas-focus-token':
      typeof props.canvasFocusOnActivateToken === 'number'
        ? String(props.canvasFocusOnActivateToken)
        : '',
    'data-canvas-focus-session-id':
      typeof props.canvasFocusSessionId === 'string' ? props.canvasFocusSessionId : '',
    'data-should-load': String(props.shouldLoad ?? false),
    'data-show-fallback': String(props.showFallback ?? false),
    'data-root-path': typeof props.rootPath === 'string' ? props.rootPath : '',
    'data-cwd': typeof props.cwd === 'string' ? props.cwd : '',
    'data-scope': typeof props.scope === 'string' ? props.scope : '',
    'data-has-on-switch-repository': String(typeof props.onSwitchRepository === 'function'),
    ...extraAttributes,
  });
}

vi.mock('lucide-react', () => {
  const icon = (name: string) => (props: Record<string, unknown>) =>
    React.createElement('svg', { ...props, 'data-icon': name });

  return {
    Activity: icon('Activity'),
    AlertCircle: icon('AlertCircle'),
    AlertTriangle: icon('AlertTriangle'),
    BrainCircuit: icon('BrainCircuit'),
    ChartNoAxesColumnIncreasing: icon('ChartNoAxesColumnIncreasing'),
    ChevronRight: icon('ChevronRight'),
    FileCode: icon('FileCode'),
    FolderGit2: icon('FolderGit2'),
    FolderOpen: icon('FolderOpen'),
    Gauge: icon('Gauge'),
    GitBranch: icon('GitBranch'),
    KanbanSquare: icon('KanbanSquare'),
    MessageSquare: icon('MessageSquare'),
    PanelLeft: icon('PanelLeft'),
    RectangleEllipsis: icon('RectangleEllipsis'),
    RefreshCw: icon('RefreshCw'),
    Settings: icon('Settings'),
    Sparkles: icon('Sparkles'),
    Terminal: icon('Terminal'),
    XIcon: icon('XIcon'),
  };
});

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  motion: {
    div: ({
      children,
      layoutId,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode; layoutId?: string }) =>
      React.createElement('div', props, children as React.ReactNode),
  },
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string) => value,
  }),
}));

vi.mock('@/components/app/OpenInMenu', () => ({
  OpenInMenu: () => React.createElement('div', { 'data-component': 'OpenInMenu' }),
}));

vi.mock('@/components/layout/RunningProjectsPopover', () => ({
  RunningProjectsPopover: () =>
    React.createElement('div', { 'data-component': 'RunningProjectsPopover' }),
}));

vi.mock('../ConsoleEmptyState', () => ({
  ConsoleEmptyState: ({
    title,
    description,
    actions,
  }: {
    title: string;
    description: string;
    actions?: React.ReactNode;
  }) =>
    React.createElement(
      'div',
      { 'data-component': 'ConsoleEmptyState' },
      React.createElement('div', null, title),
      React.createElement('div', null, description),
      actions ?? null
    ),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) =>
    React.createElement('button', { type: 'button', ...props }, children as React.ReactNode),
}));

vi.mock('@/components/ui/empty', () => ({
  EmptyDescription: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) =>
    React.createElement('div', props, children as React.ReactNode),
  EmptyHeader: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) =>
    React.createElement('div', props, children as React.ReactNode),
  EmptyTitle: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) =>
    React.createElement('div', props, children as React.ReactNode),
}));

vi.mock('@/components/ui/menu', () => ({
  Menu: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children as React.ReactNode),
  MenuItem: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) =>
    React.createElement('button', { type: 'button', ...props }, children as React.ReactNode),
  MenuPopup: ({
    children,
    sideOffset,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode; sideOffset?: number }) =>
    React.createElement('div', props, children as React.ReactNode),
  MenuTrigger: ({ render }: { render?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, render as React.ReactNode),
}));

vi.mock('@/components/ui/activityStatus', () => ({
  getMainContentLiveStatus: () => ({
    chipClassName: '',
    label: 'Ready',
  }),
}));

vi.mock('@/stores/settings', () => ({
  useSettingsStore: (selector: (state: SettingsState) => unknown) => selector(settingsState),
}));

vi.mock('@/stores/editor', () => ({
  useEditorStore: (selector: (state: EditorState) => unknown) => selector(editorState),
}));

vi.mock('@/stores/agentSessions', () => ({
  useAgentSessionsStore: (selector: (state: AgentSessionsState) => unknown) =>
    selector(agentSessionsState),
}));

vi.mock('@/stores/worktreeActivity', () => ({
  useWorktreeActivityStore: (selector: (state: WorktreeActivityState) => unknown) =>
    selector(worktreeActivityState),
}));

vi.mock('@/hooks/useLiveSubagents', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useLiveSubagents')>(
    '@/hooks/useLiveSubagents'
  );
  return {
    ...actual,
    useLiveSubagents: useLiveSubagentsMock,
  };
});

vi.mock('@/stores/terminalWrite', () => ({
  useTerminalWriteStore: (
    selector: (state: { setActiveSessionId: (id: string | null) => void }) => unknown
  ) =>
    selector({
      setActiveSessionId: vi.fn(),
    }),
}));

vi.mock('../DeferredAgentPanel', () => ({
  DeferredAgentPanel: (props: Record<string, unknown>) => renderMockPanel('agent', props),
  preloadAgentPanelComponent: preloadAgentPanelComponentMock,
}));

vi.mock('../DeferredAiCenterPanel', () => ({
  DeferredAiCenterPanel: (props: Record<string, unknown>) =>
    renderMockPanel('ai-center', props, {
      'data-has-on-open-project-task': String(typeof props.onOpenProjectTask === 'function'),
    }),
}));

vi.mock('../DeferredTerminalPanel', () => ({
  DeferredTerminalPanel: (props: Record<string, unknown>) => renderMockPanel('terminal', props),
}));

vi.mock('../DeferredFilePanel', () => ({
  DeferredFilePanel: (props: Record<string, unknown>) => renderMockPanel('file-legacy', props),
}));

vi.mock('../DeferredCurrentFilePanel', () => ({
  DeferredCurrentFilePanel: (props: Record<string, unknown>) =>
    renderMockPanel('file-current', props),
}));

vi.mock('../DeferredSourceControlPanel', () => ({
  DeferredSourceControlPanel: (props: Record<string, unknown>) =>
    renderMockPanel('source-control', props),
}));

vi.mock('../DeferredTodoPanel', () => ({
  DeferredTodoPanel: (props: Record<string, unknown>) => renderMockPanel('todo', props),
}));

vi.mock('../SubagentTranscriptPanel', () => ({
  SubagentTranscriptPanel: ({ subagent }: { subagent: { threadId: string; label: string } }) =>
    React.createElement('div', {
      'data-panel': 'subagent-transcript',
      'data-thread-id': subagent.threadId,
      'data-label': subagent.label,
    }),
}));

vi.mock('../DeferredSettingsContent', () => ({
  DeferredSettingsContent: (props: Record<string, unknown>) => renderMockPanel('settings', props),
}));

vi.mock('../DeferredDiffReviewModal', () => ({
  DeferredDiffReviewModal: () => null,
}));

describe('MainContent component render', () => {
  beforeEach(() => {
    mockPanelMountId = 0;
    settingsState.settingsDisplayMode = 'tab';
    settingsState.fileTreeDisplayMode = 'legacy';
    settingsState.agentSessionDisplayMode = 'tab';
    settingsState.retainSessionBackedChatPanels = true;
    settingsState.todoEnabled = false;
    settingsState.backgroundImageEnabled = false;
    settingsState.setSettingsDisplayMode = vi.fn();

    editorState.tabs = [];
    editorState.currentWorktreePath = null;
    editorState.worktreeStates = {};

    agentSessionsState.sessions = [];
    agentSessionsState.activeIds = {};
    agentSessionsState.runtimeStates = {};

    worktreeActivityState.activities = {};
    worktreeActivityState.activityStates = {};
    liveSubagentsByWorktree.clear();
    useLiveSubagentsMock.mockClear();
    preloadAgentPanelComponentMock.mockClear();

    setWindowElectronEnv({
      platform: 'darwin',
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
    Reflect.deleteProperty(window, 'requestIdleCallback');
    Reflect.deleteProperty(window, 'cancelIdleCallback');
  });

  async function renderMainContent(
    activeTab: TabId,
    overrides?: Partial<MainContentProps>
  ): Promise<string> {
    const { MainContent } = await import('../MainContent');
    return renderToStaticMarkup(
      React.createElement(MainContent, {
        activeTab,
        onTabChange: vi.fn(),
        repoPath: '/repo/main',
        worktreePath: '/repo/main/worktrees/current',
        sourceControlRootPath: '/repo/main/worktrees/current',
        reviewRootPath: '/repo/main/worktrees/current',
        openInPath: '/repo/main/worktrees/current',
        ...overrides,
      })
    );
  }

  async function mountMainContent(
    initialActiveTab: TabId,
    overrides?: Partial<MainContentProps>
  ): Promise<{
    container: HTMLElement;
    render: (activeTab: TabId, nextOverrides?: Partial<MainContentProps>) => Promise<void>;
    unmount: () => Promise<void>;
  }> {
    const { MainContent } = await import('../MainContent');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    const render = async (activeTab: TabId, nextOverrides?: Partial<MainContentProps>) => {
      await act(async () => {
        root.render(
          React.createElement(MainContent, {
            activeTab,
            onTabChange: vi.fn(),
            repoPath: '/repo/main',
            worktreePath: '/repo/main/worktrees/current',
            sourceControlRootPath: '/repo/main/worktrees/current',
            reviewRootPath: '/repo/main/worktrees/current',
            openInPath: '/repo/main/worktrees/current',
            ...overrides,
            ...nextOverrides,
          })
        );
        await Promise.resolve();
        await Promise.resolve();
      });
    };

    await render(initialActiveTab);

    return {
      container,
      render,
      async unmount() {
        await act(async () => {
          root.unmount();
        });
      },
    };
  }

  async function renderMainContentPanels(
    overrides?: Partial<MainContentPanelsProps>
  ): Promise<string> {
    const { MainContentPanels } = await import('../MainContentPanels');
    return renderToStaticMarkup(
      React.createElement(MainContentPanels, {
        activeTab: 'chat',
        innerBg: 'bg-background',
        repoPath: '/repo/main',
        worktreePath: '/repo/main/worktrees/current',
        currentRepoPath: '/repo/main',
        currentWorktreePath: '/repo/main/worktrees/current',
        retainedChatContext: {
          repoPath: '/repo/main',
          worktreePath: '/repo/main/worktrees/current',
        },
        visibleChatBridgeContext: null,
        hasActiveWorktree: true,
        worktreeCollapsed: false,
        onExpandWorktree: vi.fn(),
        getRepoPathForWorktree: (targetPath: string) =>
          targetPath === '/repo/main/worktrees/older' ? '/repo/main' : null,
        shouldRenderCurrentChatPanel: true,
        shouldRenderCurrentTerminalPanel: false,
        shouldRenderCurrentFilePanel: false,
        cachedChatPanelPaths: [],
        workspaceCanvasWorktrees: [],
        agentSessionDisplayMode: 'tab',
        cachedTerminalPanelPaths: [],
        cachedFilePanelPaths: [],
        fileTreeDisplayMode: 'legacy',
        shouldRenderSourceControl: false,
        sourceControlRootPath: undefined,
        sourceControlEmptyTitle: undefined,
        sourceControlEmptyDescription: undefined,
        todoEnabled: false,
        shouldRenderTodo: false,
        shouldRenderAiCenter: false,
        shouldRenderSettings: false,
        settingsDisplayMode: 'tab',
        setSettingsDisplayMode: vi.fn(),
        settingsCategory: undefined,
        onCategoryChange: undefined,
        scrollToProvider: false,
        chatCanvasRecenterToken: 0,
        chatCanvasRecenterWorktreePath: null,
        chatCanvasFocusToken: 0,
        chatCanvasFocusWorktreePath: null,
        chatCanvasFocusSessionId: null,
        onTabChange: vi.fn(),
        selectedSubagent: null,
        onCloseSelectedSubagent: vi.fn(),
        onStartupBlockingReady: vi.fn(),
        ...overrides,
      })
    );
  }

  async function renderMainContentTopbar(
    overrides?: Partial<MainContentTopbarProps>
  ): Promise<string> {
    const { MainContentTopbar } = await import('../MainContentTopbar');
    return renderToStaticMarkup(
      React.createElement(MainContentTopbar, {
        bgImageEnabled: false,
        needsTrafficLightPadding: false,
        fileSidebarCollapsed: false,
        onExpandFileSidebar: vi.fn(),
        tabs: [],
        activeTab: 'chat',
        onTabChange: vi.fn(),
        onTabReorder: vi.fn(),
        draggedIndex: null,
        dropTargetIndex: null,
        onDragStart: vi.fn(),
        onDragEnd: vi.fn(),
        onDragOver: vi.fn(),
        onDragLeave: vi.fn(),
        onDrop: vi.fn(),
        isSettingsActive: false,
        onToggleSettings: vi.fn(),
        activeSessionId: null,
        onOpenReview: vi.fn(),
        showOpenInToolbar: false,
        ...overrides,
      })
    );
  }

  it('renders the current-file panel when fileTreeDisplayMode is current', async () => {
    settingsState.fileTreeDisplayMode = 'current';
    editorState.tabs = [{ path: '/repo/main/worktrees/current/src/App.tsx' }];
    editorState.currentWorktreePath = '/repo/main/worktrees/current';

    const markup = await renderMainContent('file');

    expect(markup).toContain('data-panel="file-current"');
    expect(markup).not.toContain('data-panel="file-legacy"');
  }, 15000);

  it('renders without an Electron env bridge when platform data is unavailable', async () => {
    setWindowElectronEnv();

    const markup = await renderMainContent('file');

    expect(markup).toContain('data-panel="file-legacy"');
    expect(markup).toContain('data-tree-enabled="true"');
  }, 15000);

  it('retains the legacy file panel while inactive when the current worktree still has open tabs', async () => {
    settingsState.fileTreeDisplayMode = 'legacy';
    editorState.tabs = [{ path: '/repo/main/worktrees/current/src/App.tsx' }];
    editorState.currentWorktreePath = '/repo/main/worktrees/current';

    const markup = await renderMainContent('source-control');

    expect(markup).toContain('data-panel="file-legacy"');
    expect(markup).toContain('data-tree-enabled="false"');
    expect(markup).toContain('data-show-fallback="false"');
    expect(markup).toContain('data-panel="source-control"');
  });

  it('retains the legacy file panel on case-insensitive platforms when tab paths differ in casing', async () => {
    settingsState.fileTreeDisplayMode = 'legacy';
    editorState.tabs = [{ path: '/Repo/Main/Worktrees/Current/src/App.tsx' }];
    editorState.currentWorktreePath = '/repo/main/worktrees/current';

    vi.stubGlobal('navigator', {
      platform: 'MacIntel',
    });

    const markup = await renderMainContent('source-control');

    expect(markup).toContain('data-panel="file-legacy"');
    expect(markup).toContain('data-panel="source-control"');
  });

  it('releases the current file panel while inactive when the current worktree has no open tabs', async () => {
    settingsState.fileTreeDisplayMode = 'legacy';
    editorState.tabs = [];
    editorState.currentWorktreePath = '/repo/main/worktrees/current';
    editorState.worktreeStates = {
      '/repo/main/worktrees/current': {
        tabs: [],
      },
    };

    const markup = await renderMainContent('source-control');

    expect(markup).not.toContain('data-panel="file-legacy"');
    expect(markup).toContain('data-panel="source-control"');
  });

  it('renders the current agent panel while the chat tab is active even without background activity', async () => {
    const markup = await renderMainContent('chat');

    expect(markup).toContain('data-panel="agent"');
    expect(markup).not.toContain('data-panel="terminal"');
  });

  it('preloads the agent panel module after a worktree context is available', async () => {
    vi.useFakeTimers();

    const mounted = await mountMainContent('file');

    expect(preloadAgentPanelComponentMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
    });

    expect(preloadAgentPanelComponentMock).toHaveBeenCalledTimes(1);

    await mounted.unmount();
  });

  it('reschedules agent panel preloading when the worktree changes before idle time', async () => {
    const idleCallbacks = new Map<number, IdleRequestCallback>();
    const cancelledIdleIds = new Set<number>();
    let nextIdleId = 0;
    Object.defineProperty(window, 'requestIdleCallback', {
      configurable: true,
      value: vi.fn((callback: IdleRequestCallback) => {
        nextIdleId += 1;
        idleCallbacks.set(nextIdleId, callback);
        return nextIdleId;
      }),
    });
    Object.defineProperty(window, 'cancelIdleCallback', {
      configurable: true,
      value: vi.fn((id: number) => {
        cancelledIdleIds.add(id);
      }),
    });

    const mounted = await mountMainContent('file');

    await mounted.render('file', {
      worktreePath: '/repo/main/worktrees/next',
      sourceControlRootPath: '/repo/main/worktrees/next',
      reviewRootPath: '/repo/main/worktrees/next',
      openInPath: '/repo/main/worktrees/next',
    });

    expect(cancelledIdleIds.has(1)).toBe(true);

    await act(async () => {
      idleCallbacks.get(1)?.({ didTimeout: false, timeRemaining: () => 50 });
      idleCallbacks.get(2)?.({ didTimeout: false, timeRemaining: () => 50 });
      await Promise.resolve();
    });

    expect(preloadAgentPanelComponentMock).toHaveBeenCalledTimes(1);

    await mounted.unmount();
  });

  it('does not preload the agent panel module without a worktree context', async () => {
    vi.useFakeTimers();

    const mounted = await mountMainContent('file', {
      repoPath: undefined,
      worktreePath: undefined,
      sourceControlRootPath: undefined,
      reviewRootPath: undefined,
      openInPath: undefined,
    });

    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
    });

    expect(preloadAgentPanelComponentMock).not.toHaveBeenCalled();

    await mounted.unmount();
  });

  it('keeps project todo in the top-level tabs and leaves AI center to the sidebar', async () => {
    settingsState.todoEnabled = true;

    const markup = await renderMainContent('chat');

    expect(markup).toContain('Project Todo');
    expect(markup).not.toContain('AI Center');
  });

  it('renders the AI center tab as a separate global orchestration panel', async () => {
    settingsState.todoEnabled = true;

    const markup = await renderMainContent('ai-center');

    expect(markup).toContain('data-panel="ai-center"');
    expect(markup).toContain('data-active="true"');
    expect(markup).toContain('data-has-on-open-project-task="true"');
  });

  it('keeps the global canvas agent panel mounted across worktree switches', async () => {
    settingsState.agentSessionDisplayMode = 'global-canvas';

    const mounted = await mountMainContent('chat');
    const firstPanel = mounted.container.querySelector('[data-panel="agent"]');
    const firstMountId = firstPanel?.getAttribute('data-mount-id');

    await mounted.render('chat', {
      worktreePath: '/repo/main/worktrees/next',
      sourceControlRootPath: '/repo/main/worktrees/next',
      reviewRootPath: '/repo/main/worktrees/next',
      openInPath: '/repo/main/worktrees/next',
    });

    const nextPanel = mounted.container.querySelector('[data-panel="agent"]');

    expect(firstMountId).toBeTruthy();
    expect(nextPanel?.getAttribute('data-mount-id')).toBe(firstMountId);
    expect(nextPanel?.getAttribute('data-cwd')).toBe('/repo/main/worktrees/next');

    await mounted.unmount();
  });

  it('keeps the global canvas agent panel mounted across repository worktree switches', async () => {
    settingsState.agentSessionDisplayMode = 'global-canvas';

    const mounted = await mountMainContent('chat', {
      repoPath: '/repo/alpha',
      worktreePath: '/repo/alpha/worktrees/current',
      sourceControlRootPath: '/repo/alpha/worktrees/current',
      reviewRootPath: '/repo/alpha/worktrees/current',
      openInPath: '/repo/alpha/worktrees/current',
    });
    const firstPanel = mounted.container.querySelector('[data-panel="agent"]');
    const firstMountId = firstPanel?.getAttribute('data-mount-id');

    await mounted.render('chat', {
      repoPath: '/repo/beta',
      worktreePath: '/repo/beta/worktrees/current',
      sourceControlRootPath: '/repo/beta/worktrees/current',
      reviewRootPath: '/repo/beta/worktrees/current',
      openInPath: '/repo/beta/worktrees/current',
    });

    const nextPanel = mounted.container.querySelector('[data-panel="agent"]');

    expect(firstMountId).toBeTruthy();
    expect(nextPanel?.getAttribute('data-mount-id')).toBe(firstMountId);
    expect(nextPanel?.getAttribute('data-cwd')).toBe('/repo/beta/worktrees/current');

    await mounted.unmount();
  });

  it('keeps cached chat panels loaded for inactive worktrees so session views survive worktree switches', async () => {
    const markup = await renderMainContentPanels({
      cachedChatPanelPaths: ['/repo/main/worktrees/older'],
    });

    expect(markup).toContain('data-panel="agent"');
    expect(markup).toContain('data-cwd="/repo/main/worktrees/current"');
    expect(markup).toContain('data-cwd="/repo/main/worktrees/older"');
    expect(markup).toMatch(
      /<div data-panel="agent"[^>]*data-cwd="\/repo\/main\/worktrees\/current"[^>]*data-should-load="true"|<div data-panel="agent"[^>]*data-should-load="true"[^>]*data-cwd="\/repo\/main\/worktrees\/current"/
    );
    expect(markup).toMatch(
      /<div data-panel="agent"[^>]*data-cwd="\/repo\/main\/worktrees\/older"[^>]*data-should-load="true"|<div data-panel="agent"[^>]*data-should-load="true"[^>]*data-cwd="\/repo\/main\/worktrees\/older"/
    );
    expect(markup).toMatch(
      /<div data-panel="agent"[^>]*data-cwd="\/repo\/main\/worktrees\/older"[^>]*data-show-fallback="false"|<div data-panel="agent"[^>]*data-show-fallback="false"[^>]*data-cwd="\/repo\/main\/worktrees\/older"/
    );
  });

  it('keeps the previous chat panel visible while the next worktree panel restores in the background', async () => {
    const markup = await renderMainContentPanels({
      currentWorktreePath: '/repo/main/worktrees/next',
      retainedChatContext: {
        repoPath: '/repo/main',
        worktreePath: '/repo/main/worktrees/next',
      },
      visibleChatBridgeContext: {
        repoPath: '/repo/main',
        worktreePath: '/repo/main/worktrees/current',
      },
    });

    expect(markup).toMatch(
      /class="absolute inset-0 bg-background invisible pointer-events-none z-0"><div data-panel="agent"[^>]*data-cwd="\/repo\/main\/worktrees\/next"/
    );
    expect(markup).toMatch(
      /class="absolute inset-0 bg-background z-10"><div data-panel="agent"[^>]*data-cwd="\/repo\/main\/worktrees\/current"/
    );
    expect(markup).toMatch(
      /<div data-panel="agent"[^>]*data-active="true"[^>]*data-cwd="\/repo\/main\/worktrees\/current"|<div data-panel="agent"[^>]*data-cwd="\/repo\/main\/worktrees\/current"[^>]*data-active="true"/
    );
  });

  it('passes workspace canvas worktrees to every retained chat panel', async () => {
    const markup = await renderMainContentPanels({
      cachedChatPanelPaths: ['/repo/main/worktrees/older'],
      getRepoPathForWorktree: () => '/repo/main',
      workspaceCanvasWorktrees: [
        {
          repoPath: '/repo/main',
          worktreePath: '/repo/main/worktrees/current',
        },
        {
          repoPath: '/repo/main',
          worktreePath: '/repo/main/worktrees/older',
        },
      ],
    });

    expect(markup.match(/data-workspace-canvas-worktree-count="2"/g)).toHaveLength(2);
    expect(markup).toContain(
      'data-workspace-canvas-worktrees="/repo/main::/repo/main/worktrees/current|/repo/main::/repo/main/worktrees/older"'
    );
  });

  it('passes project task opening to the AI center for cross-project focus', async () => {
    const markup = await renderMainContentPanels({
      activeTab: 'ai-center',
      todoEnabled: true,
      shouldRenderAiCenter: true,
      onSwitchRepository: vi.fn(),
    } as Partial<MainContentPanelsProps>);

    expect(markup).toContain('data-panel="ai-center"');
    expect(markup).toContain('data-has-on-open-project-task="true"');
  });

  it('renders project todo and AI center as separate entries', async () => {
    const projectMarkup = await renderMainContentPanels({
      activeTab: 'todo',
      todoEnabled: true,
      shouldRenderTodo: true,
    });
    const aiCenterMarkup = await renderMainContentPanels({
      activeTab: 'ai-center',
      todoEnabled: true,
      shouldRenderAiCenter: true,
    });

    expect(projectMarkup).toContain('data-panel="todo"');
    expect(projectMarkup).toContain('data-active="true"');
    expect(aiCenterMarkup).toContain('data-panel="ai-center"');
    expect(aiCenterMarkup).toContain('data-active="true"');
  });

  it('passes the recenter token only to the current chat panel that matches the requested worktree', async () => {
    const markup = await renderMainContentPanels({
      cachedChatPanelPaths: ['/repo/main/worktrees/older'],
      chatCanvasRecenterToken: 7,
      chatCanvasRecenterWorktreePath: '/repo/main/worktrees/current',
    });

    expect(markup).toMatch(
      /<div data-panel="agent"[^>]*data-cwd="\/repo\/main\/worktrees\/current"[^>]*data-canvas-recenter-token="7"|<div data-panel="agent"[^>]*data-canvas-recenter-token="7"[^>]*data-cwd="\/repo\/main\/worktrees\/current"/
    );
    expect(markup).toMatch(
      /<div data-panel="agent"[^>]*data-cwd="\/repo\/main\/worktrees\/current"[^>]*data-canvas-recenter-worktree-path="\/repo\/main\/worktrees\/current"|<div data-panel="agent"[^>]*data-canvas-recenter-worktree-path="\/repo\/main\/worktrees\/current"[^>]*data-cwd="\/repo\/main\/worktrees\/current"/
    );
    expect(markup).toMatch(
      /<div data-panel="agent"[^>]*data-cwd="\/repo\/main\/worktrees\/older"[^>]*data-canvas-recenter-token="0"|<div data-panel="agent"[^>]*data-canvas-recenter-token="0"[^>]*data-cwd="\/repo\/main\/worktrees\/older"/
    );
    expect(markup).toMatch(
      /<div data-panel="agent"[^>]*data-cwd="\/repo\/main\/worktrees\/older"[^>]*data-canvas-recenter-worktree-path=""|<div data-panel="agent"[^>]*data-canvas-recenter-worktree-path=""[^>]*data-cwd="\/repo\/main\/worktrees\/older"/
    );
  });

  it('passes the canvas focus request only to the current chat panel that matches the requested worktree', async () => {
    const markup = await renderMainContentPanels({
      cachedChatPanelPaths: ['/repo/main/worktrees/older'],
      chatCanvasFocusToken: 11,
      chatCanvasFocusWorktreePath: '/repo/main/worktrees/current',
      chatCanvasFocusSessionId: 'session-2',
    });

    expect(markup).toMatch(
      /<div data-panel="agent"[^>]*data-cwd="\/repo\/main\/worktrees\/current"[^>]*data-canvas-focus-token="11"[^>]*data-canvas-focus-session-id="session-2"|<div data-panel="agent"[^>]*data-canvas-focus-token="11"[^>]*data-canvas-focus-session-id="session-2"[^>]*data-cwd="\/repo\/main\/worktrees\/current"/
    );
    expect(markup).toMatch(
      /<div data-panel="agent"[^>]*data-cwd="\/repo\/main\/worktrees\/older"[^>]*data-canvas-focus-token="0"[^>]*data-canvas-focus-session-id=""|<div data-panel="agent"[^>]*data-canvas-focus-token="0"[^>]*data-canvas-focus-session-id=""[^>]*data-cwd="\/repo\/main\/worktrees\/older"/
    );
  });

  it('does not render collapsed sidebar controls in the main topbar', async () => {
    const markup = await renderMainContentTopbar({
      fileSidebarCollapsed: true,
    });

    expect(markup).not.toContain('data-component="RunningProjectsPopover"');
    expect(markup).not.toContain('Panels');
    expect(markup).not.toContain('Expand Repository');
    expect(markup).not.toContain('Expand Worktree');
    expect(markup).not.toContain('Expand File Sidebar');
  });

  it('keeps the current agent panel mounted behind the selected subagent transcript', async () => {
    const markup = await renderMainContent('chat', {
      selectedSubagent: {
        id: 'child-1',
        provider: 'codex',
        threadId: 'child-thread-1',
        parentThreadId: 'root-thread-1',
        cwd: '/repo/main/worktrees/current',
        label: 'Reviewer 1',
        lastSeenAt: Date.now(),
        status: 'running',
      },
    });

    expect(markup).toContain('data-panel="agent"');
    expect(markup).toContain('data-active="false"');
    expect(markup).toContain('data-show-fallback="false"');
    expect(markup).toContain('data-panel="subagent-transcript"');
    expect(markup).toContain('data-thread-id="child-thread-1"');
  });

  it('retains the current agent panel while inactive when the current worktree still has agent activity', async () => {
    worktreeActivityState.activities = {
      '/repo/main/worktrees/current': {
        agentCount: 1,
        terminalCount: 0,
      },
    };

    const markup = await renderMainContent('source-control');

    expect(markup).toContain('data-panel="agent"');
    expect(markup).toContain('data-show-fallback="false"');
    expect(markup).toContain('data-panel="source-control"');
  });

  it('retains the current agent panel while inactive when the session is waiting for input even without store activity', async () => {
    agentSessionsState.sessions = [
      {
        id: 'session-1',
        repoPath: '/repo/main',
        cwd: '/repo/main/worktrees/current',
        agentId: 'claude',
        sessionId: 'claude-thread-1',
        initialized: true,
      },
    ];
    agentSessionsState.runtimeStates = {
      'session-1': {
        outputState: 'idle',
        lastActivityAt: 1,
        waitingForInput: true,
        hasCompletedTaskUnread: false,
      },
    };

    const markup = await renderMainContent('source-control');

    expect(markup).toContain('data-panel="agent"');
    expect(markup).toContain('data-show-fallback="false"');
    expect(markup).toContain('data-panel="source-control"');
  });

  it('does not poll codex live subagents while the chat panel is retained in the background', async () => {
    agentSessionsState.sessions = [
      {
        id: 'session-1',
        repoPath: '/repo/main',
        cwd: '/repo/main/worktrees/current',
        agentId: 'codex',
        sessionId: 'root-thread-1',
        initialized: true,
      },
    ];
    agentSessionsState.runtimeStates = {
      'session-1': {
        outputState: 'idle',
        lastActivityAt: 1,
        waitingForInput: false,
        hasCompletedTaskUnread: false,
      },
    };
    liveSubagentsByWorktree.set('/repo/main/worktrees/current', [
      {
        id: 'subagent-1',
        provider: 'codex',
        threadId: 'child-thread-1',
        rootThreadId: 'root-thread-1',
        parentThreadId: 'root-thread-1',
        cwd: '/repo/main/worktrees/current',
        label: 'Worker 1',
        lastSeenAt: 10,
        status: 'running',
      },
    ]);

    const markup = await renderMainContent('source-control');

    expect(useLiveSubagentsMock).toHaveBeenCalledWith([]);
    expect(markup).toContain('data-panel="agent"');
    expect(markup).toContain('data-show-fallback="false"');
    expect(markup).toContain('data-panel="source-control"');
  });

  it('limits visible chat live subagent polling to the current worktree instead of every initialized session cwd', async () => {
    agentSessionsState.sessions = [
      {
        id: 'session-1',
        repoPath: '/repo/main',
        cwd: '/repo/main/worktrees/current',
        agentId: 'codex',
        sessionId: 'root-thread-1',
        initialized: true,
      },
      {
        id: 'session-2',
        repoPath: '/repo/main',
        cwd: '/repo/main/worktrees/archived',
        agentId: 'codex',
        sessionId: 'root-thread-2',
        initialized: true,
      },
    ];

    await renderMainContent('chat');

    expect(useLiveSubagentsMock).toHaveBeenCalledWith(['/repo/main/worktrees/current']);
  });

  it('retains the current agent panel for darwin-equivalent worktree paths when session cwd uses a different alias', async () => {
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'MacIntel',
    });

    agentSessionsState.sessions = [
      {
        id: 'session-1',
        repoPath: '/private/var/folders/demo/repo-main',
        cwd: '/var/folders/demo/repo-feature',
        initialized: true,
      },
    ];

    const markup = await renderMainContent('source-control', {
      repoPath: '/private/var/folders/demo/repo-main',
      worktreePath: '/private/var/folders/demo/repo-feature',
      sourceControlRootPath: '/private/var/folders/demo/repo-feature',
      reviewRootPath: '/private/var/folders/demo/repo-feature',
      openInPath: '/private/var/folders/demo/repo-feature',
    });

    expect(markup).toContain('data-panel="agent"');
    expect(markup).toContain('data-cwd="/private/var/folders/demo/repo-feature"');
    expect(markup).toContain('data-show-fallback="false"');
  });

  it('releases the current agent panel while inactive when the current worktree has no agent activity', async () => {
    worktreeActivityState.activities = {
      '/repo/main/worktrees/current': {
        agentCount: 0,
        terminalCount: 0,
      },
    };

    const markup = await renderMainContent('source-control');

    expect(markup).not.toContain('data-panel="agent"');
    expect(markup).toContain('data-panel="source-control"');
  });

  it('retains the current agent panel when only stale idle session history remains', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-09T12:00:00.000Z'));

    agentSessionsState.sessions = [
      {
        id: 'session-1',
        repoPath: '/repo/main',
        cwd: '/repo/main/worktrees/current',
        initialized: true,
      },
    ];
    agentSessionsState.runtimeStates = {
      'session-1': {
        outputState: 'idle',
        lastActivityAt: Date.now() - 10 * 60 * 1000,
      },
    };

    const markup = await renderMainContent('source-control');

    expect(markup).toContain('data-panel="agent"');
    expect(markup).toContain('data-show-fallback="false"');
    expect(markup).toContain('data-panel="source-control"');

    vi.useRealTimers();
  });

  it('does not release an inactive agent panel solely because session activity is stale', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-09T12:00:00.000Z'));
    settingsState.retainSessionBackedChatPanels = false;

    agentSessionsState.sessions = [
      {
        id: 'session-1',
        repoPath: '/repo/main',
        cwd: '/repo/main/worktrees/current',
        initialized: true,
      },
    ];
    agentSessionsState.runtimeStates = {
      'session-1': {
        outputState: 'idle',
        lastActivityAt: Date.now() - 10 * 60 * 1000,
      },
    };

    const markup = await renderMainContent('source-control');

    expect(markup).toContain('data-panel="agent"');
    expect(markup).toContain('data-show-fallback="false"');
    expect(markup).toContain('data-panel="source-control"');

    vi.useRealTimers();
  });

  it('starts the idle chat cooldown when the user switches away from the chat tab', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-09T12:00:00.000Z'));
    settingsState.retainSessionBackedChatPanels = false;

    agentSessionsState.sessions = [
      {
        id: 'session-1',
        repoPath: '/repo/main',
        cwd: '/repo/main/worktrees/current',
        initialized: true,
      },
    ];
    agentSessionsState.runtimeStates = {
      'session-1': {
        outputState: 'idle',
        lastActivityAt: Date.now() - 10 * 60 * 1000,
      },
    };

    const { container, render, unmount } = await mountMainContent('chat');

    expect(container.querySelector('[data-panel="agent"]')).not.toBeNull();

    await render('source-control');
    expect(container.querySelector('[data-panel="agent"]')).not.toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-panel="agent"]')).toBeNull();

    await unmount();
  });

  it('keeps every session-backed worktree mounted beyond the warm-cache limit', async () => {
    agentSessionsState.sessions = [
      '/repo/main/worktrees/current',
      '/repo/main/worktrees/older-a',
      '/repo/main/worktrees/older-b',
      '/repo/main/worktrees/older-c',
      '/repo/main/worktrees/older-d',
      '/repo/main/worktrees/older-e',
    ].map((cwd, index) => ({
      id: `session-${index}`,
      repoPath: '/repo/main',
      cwd,
      initialized: true,
    }));

    const { container, unmount } = await mountMainContent('chat');

    expect(container.querySelectorAll('[data-panel="agent"]')).toHaveLength(6);
    expect(container.innerHTML).toContain('data-cwd="/repo/main/worktrees/older-e"');

    await unmount();
  });

  it('retains the current terminal panel while inactive when the current worktree still has terminal activity', async () => {
    worktreeActivityState.activities = {
      '/repo/main/worktrees/current': {
        agentCount: 0,
        terminalCount: 2,
      },
    };

    const markup = await renderMainContent('source-control');

    expect(markup).toContain('data-panel="terminal"');
    expect(markup).toContain('data-show-fallback="false"');
    expect(markup).toContain('data-panel="source-control"');
  });

  it('releases the current terminal panel while inactive when the current worktree has no terminal activity', async () => {
    worktreeActivityState.activities = {
      '/repo/main/worktrees/current': {
        agentCount: 0,
        terminalCount: 0,
      },
    };

    const markup = await renderMainContent('source-control');

    expect(markup).not.toContain('data-panel="terminal"');
    expect(markup).toContain('data-panel="source-control"');
  });

  it('shows the onboarding idle state on the chat tab when no worktree is selected', async () => {
    const markup = await renderMainContent('chat', {
      repoPath: undefined,
      worktreePath: undefined,
      sourceControlRootPath: undefined,
      reviewRootPath: undefined,
      openInPath: undefined,
    });

    expect(markup).toContain('AI Agent needs a worktree');
    expect(markup).toContain('Each worktree keeps its own agent sessions, context, and output.');
    expect(markup).not.toContain('data-panel="agent"');
  });

  it('shows the choose-worktree action in the chat idle state when the worktree sidebar is collapsed', async () => {
    const markup = await renderMainContent('chat', {
      repoPath: undefined,
      worktreePath: undefined,
      sourceControlRootPath: undefined,
      reviewRootPath: undefined,
      openInPath: undefined,
      worktreeCollapsed: true,
      onExpandWorktree: vi.fn(),
    });

    expect(markup).toContain('Choose Worktree');
    expect(markup).toContain('AI Agent needs a worktree');
  });

  it('does not pass the previous worktree path into the current file panel when the current selection has no worktree yet', async () => {
    settingsState.fileTreeDisplayMode = 'legacy';
    editorState.tabs = [{ path: '/repo/old/worktrees/previous/src/App.tsx' }];
    editorState.currentWorktreePath = '/repo/old/worktrees/previous';

    const initialMarkup = await renderMainContent('file', {
      repoPath: '/repo/old',
      worktreePath: '/repo/old/worktrees/previous',
      sourceControlRootPath: '/repo/old/worktrees/previous',
      reviewRootPath: '/repo/old/worktrees/previous',
      openInPath: '/repo/old/worktrees/previous',
    });
    expect(initialMarkup).toContain('data-root-path="/repo/old/worktrees/previous"');

    editorState.tabs = [];
    editorState.currentWorktreePath = '/repo/old/worktrees/previous';
    editorState.worktreeStates = {
      '/repo/old/worktrees/previous': {
        tabs: [{ path: '/repo/old/worktrees/previous/src/App.tsx' }],
      },
    };

    const switchedMarkup = await renderMainContent('file', {
      repoPath: '/repo/new',
      worktreePath: undefined,
      sourceControlRootPath: undefined,
      reviewRootPath: undefined,
      openInPath: undefined,
    });

    expect(switchedMarkup).toContain('data-panel="file-legacy"');
    expect(switchedMarkup).toContain('data-root-path=""');
    expect(switchedMarkup).not.toContain('data-root-path="/repo/old/worktrees/previous"');
  });

  it('does not render a standalone Ready status row for an idle selected worktree', async () => {
    const markup = await renderMainContent('file');

    expect(markup).not.toContain('>Ready<');
    expect(markup).not.toContain('control-topbar-status');
  });

  it('uses the shared topbar action styling for the settings button', async () => {
    const markup = await renderMainContent('file');

    expect(markup).toContain('aria-label="Settings"');
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain('class="control-topbar-action"');
    expect(markup).not.toContain('control-topbar-shell-button');
  });

  it('renders the main header with the shared topbar header shell class', async () => {
    const markup = await renderMainContent('file');

    expect(markup).toContain('control-topbar-header');
  });
});
