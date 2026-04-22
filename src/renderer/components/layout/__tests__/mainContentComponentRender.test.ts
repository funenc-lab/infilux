/* @vitest-environment jsdom */

import type { LiveAgentSubagent } from '@shared/types';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TabId } from '@/App/constants';

type SettingsState = {
  settingsDisplayMode: 'tab' | 'draggable-modal';
  setSettingsDisplayMode: (mode: 'tab' | 'draggable-modal') => void;
  fileTreeDisplayMode: 'legacy' | 'current';
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
  return React.createElement('div', {
    'data-panel': panel,
    'data-active': String(props.isActive ?? false),
    'data-tree-enabled': String(props.treeEnabled ?? ''),
    'data-canvas-recenter-token':
      typeof props.canvasRecenterOnActivateToken === 'number'
        ? String(props.canvasRecenterOnActivateToken)
        : '',
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
    ...extraAttributes,
  });
}

vi.mock('lucide-react', () => {
  const icon = (name: string) => (props: Record<string, unknown>) =>
    React.createElement('svg', { ...props, 'data-icon': name });

  return {
    Activity: icon('Activity'),
    AlertCircle: icon('AlertCircle'),
    ChevronRight: icon('ChevronRight'),
    FileCode: icon('FileCode'),
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
    settingsState.settingsDisplayMode = 'tab';
    settingsState.fileTreeDisplayMode = 'legacy';
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

    setWindowElectronEnv({
      platform: 'darwin',
    });
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
        hasActiveWorktree: true,
        worktreeCollapsed: false,
        onExpandWorktree: vi.fn(),
        getRepoPathForWorktree: (targetPath: string) =>
          targetPath === '/repo/main/worktrees/older' ? '/repo/main' : null,
        shouldRenderCurrentChatPanel: true,
        shouldRenderCurrentTerminalPanel: false,
        shouldRenderCurrentFilePanel: false,
        cachedChatPanelPaths: [],
        cachedTerminalPanelPaths: [],
        cachedFilePanelPaths: [],
        fileTreeDisplayMode: 'legacy',
        shouldRenderSourceControl: false,
        sourceControlRootPath: undefined,
        sourceControlEmptyTitle: undefined,
        sourceControlEmptyDescription: undefined,
        todoEnabled: false,
        shouldRenderTodo: false,
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
        repositoryCollapsed: false,
        fileSidebarCollapsed: false,
        onExpandFileSidebar: vi.fn(),
        onSwitchWorktree: vi.fn(),
        onSwitchTab: vi.fn(),
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
      /<div data-panel="agent"[^>]*data-cwd="\/repo\/main\/worktrees\/older"[^>]*data-canvas-recenter-token="0"|<div data-panel="agent"[^>]*data-canvas-recenter-token="0"[^>]*data-cwd="\/repo\/main\/worktrees\/older"/
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

  it('does not render a duplicated Panels menu when sidebars are collapsed', async () => {
    const markup = await renderMainContentTopbar({
      repositoryCollapsed: true,
      fileSidebarCollapsed: true,
    });

    expect(markup).toContain('data-component="RunningProjectsPopover"');
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

  it('polls codex live subagents for inactive worktrees so background tasks do not collapse to idle', async () => {
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

    expect(useLiveSubagentsMock).toHaveBeenCalledWith(['/repo/main/worktrees/current']);
    expect(markup).toContain('data-panel="agent"');
    expect(markup).toContain('data-show-fallback="false"');
    expect(markup).toContain('data-panel="source-control"');
  });

  it('limits codex live subagent polling to the current worktree instead of every initialized session cwd', async () => {
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

    await renderMainContent('source-control');

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

  it('releases the current agent panel after cooldown when session-backed retention is disabled', async () => {
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

    expect(markup).not.toContain('data-panel="agent"');
    expect(markup).toContain('data-panel="source-control"');

    vi.useRealTimers();
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
