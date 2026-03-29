import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TabId } from '@/App/constants';

type SettingsState = {
  settingsDisplayMode: 'tab' | 'draggable-modal';
  setSettingsDisplayMode: (mode: 'tab' | 'draggable-modal') => void;
  fileTreeDisplayMode: 'legacy' | 'current';
  todoEnabled: boolean;
  backgroundImageEnabled: boolean;
};

type EditorState = {
  tabs: Array<{ path: string }>;
  currentWorktreePath: string | null;
  worktreeStates: Record<string, { tabs: Array<{ path: string }> }>;
};

type AgentSessionsState = {
  sessions: Array<{ id: string; repoPath: string; cwd: string; initialized?: boolean }>;
  activeIds: Record<string, string>;
  runtimeStates: Record<string, { outputState?: 'unread' | 'outputting' }>;
};

type WorktreeActivityState = {
  activities: Record<string, { agentCount: number; terminalCount: number }>;
  activityStates: Record<string, 'idle' | 'running' | 'waiting_input' | 'completed'>;
};

type MainContentModule = typeof import('../MainContent');
type MainContentProps = React.ComponentProps<MainContentModule['MainContent']>;

const settingsState: SettingsState = {
  settingsDisplayMode: 'tab',
  setSettingsDisplayMode: vi.fn(),
  fileTreeDisplayMode: 'legacy',
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

function renderMockPanel(
  panel: string,
  props: Record<string, unknown>,
  extraAttributes?: Record<string, string>
) {
  return React.createElement('div', {
    'data-panel': panel,
    'data-active': String(props.isActive ?? false),
    'data-should-load': String(props.shouldLoad ?? false),
    'data-root-path': typeof props.rootPath === 'string' ? props.rootPath : '',
    ...extraAttributes,
  });
}

vi.mock('lucide-react', () => {
  const icon = (name: string) => (props: Record<string, unknown>) =>
    React.createElement('svg', { ...props, 'data-icon': name });

  return {
    Activity: icon('Activity'),
    ChevronRight: icon('ChevronRight'),
    FileCode: icon('FileCode'),
    FolderOpen: icon('FolderOpen'),
    GitBranch: icon('GitBranch'),
    KanbanSquare: icon('KanbanSquare'),
    MessageSquare: icon('MessageSquare'),
    PanelLeft: icon('PanelLeft'),
    RectangleEllipsis: icon('RectangleEllipsis'),
    Settings: icon('Settings'),
    Sparkles: icon('Sparkles'),
    Terminal: icon('Terminal'),
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

    vi.stubGlobal('window', {
      electronAPI: {
        env: {
          platform: 'darwin',
        },
      },
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

  it('renders the current-file panel when fileTreeDisplayMode is current', async () => {
    settingsState.fileTreeDisplayMode = 'current';
    editorState.tabs = [{ path: '/repo/main/worktrees/current/src/App.tsx' }];
    editorState.currentWorktreePath = '/repo/main/worktrees/current';

    const markup = await renderMainContent('file');

    expect(markup).toContain('data-panel="file-current"');
    expect(markup).not.toContain('data-panel="file-legacy"');
  }, 10_000);

  it('retains the legacy file panel while inactive when the current worktree still has open tabs', async () => {
    settingsState.fileTreeDisplayMode = 'legacy';
    editorState.tabs = [{ path: '/repo/main/worktrees/current/src/App.tsx' }];
    editorState.currentWorktreePath = '/repo/main/worktrees/current';

    const markup = await renderMainContent('source-control');

    expect(markup).toContain('data-panel="file-legacy"');
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

  it('renders the selected subagent transcript overlay while preserving the agent panel', async () => {
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
    expect(markup).toContain('data-panel="source-control"');
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

  it('retains the current terminal panel while inactive when the current worktree still has terminal activity', async () => {
    worktreeActivityState.activities = {
      '/repo/main/worktrees/current': {
        agentCount: 0,
        terminalCount: 2,
      },
    };

    const markup = await renderMainContent('source-control');

    expect(markup).toContain('data-panel="terminal"');
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
