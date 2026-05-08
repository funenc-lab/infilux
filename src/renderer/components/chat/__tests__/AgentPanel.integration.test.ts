/* @vitest-environment jsdom */

import type { PersistentAgentSessionRecord, RestoreWorktreeSessionsResult } from '@shared/types';
import { toRemoteVirtualPath } from '@shared/utils/remotePath';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { useAgentStatusStore } from '@/stores/agentStatus';
import { useCodeReviewContinueStore } from '@/stores/codeReviewContinue';
import { useEditorStore } from '@/stores/editor';
import { useTerminalStore } from '@/stores/terminal';
import { useTodoStore } from '@/stores/todo';
import { resetWorktreeAgentSessionRecoveryCacheForTests } from '../agentSessionRecovery';
import type { Session } from '../SessionBar';

type AgentPanelModule = typeof import('../AgentPanel');
type AgentPanelProps = React.ComponentProps<AgentPanelModule['AgentPanel']>;
let AgentPanelUnderTest: AgentPanelModule['AgentPanel'] | null = null;

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const testState = vi.hoisted(() => ({
  installedAgents: ['gemini'] as string[],
  rendererEnvironment: {
    platform: 'win32' as const,
    runtimeChannel: 'prod',
  },
  worktreeActivity: {
    setAgentCount: vi.fn(),
    registerAgentCloseHandler: vi.fn(() => vi.fn()),
    setDerivedActivityState: vi.fn(),
    clearDerivedActivityState: vi.fn(),
  },
  settings: {
    agentSettings: {
      claude: { enabled: false, isDefault: false },
      codex: { enabled: false, isDefault: false },
      gemini: { enabled: true, isDefault: true },
      cursor: { enabled: false, isDefault: false },
    } as Record<
      string,
      { enabled: boolean; isDefault: boolean; customPath?: string; customArgs?: string }
    >,
    agentDetectionStatus: {},
    customAgents: [] as Array<{ id: string; name: string; command: string }>,
    xtermKeybindings: {
      newTab: 'cmd+t',
      closeTab: 'cmd+w',
      nextTab: 'ctrl+tab',
      prevTab: 'ctrl+shift+tab',
    },
    hapiSettings: {
      enabled: false,
      happyEnabled: false,
      cliApiToken: '',
    },
    autoCreateSessionOnActivate: false,
    autoCreateSessionOnTempActivate: false,
    agentIntegration: {
      tmuxEnabled: false,
      enhancedInputEnabled: true,
      enhancedInputAutoPopup: 'manual',
      statusLineEnabled: true,
      autoSessionRollover: false,
    },
    terminalTheme: 'ghostty-dark',
    fontFamily: 'IBM Plex Sans',
    fontSize: 14,
    editorSettings: {
      fontFamily: 'JetBrains Mono',
      fontSize: 13,
      lineHeight: 1.5,
    },
    agentSessionDisplayMode: 'tab',
    backgroundImageEnabled: false,
    confirmBeforeClosingAgentSession: false,
    quickTerminal: {
      enabled: false,
      isOpen: false,
    },
    setAgentIntegration: vi.fn((updates: Record<string, unknown>) => {
      Object.assign(testState.settings.agentIntegration, updates);
    }),
    setQuickTerminalOpen: vi.fn((open: boolean) => {
      testState.settings.quickTerminal.isOpen = open;
    }),
  },
  electronAPI: {
    restoreWorktreeSessions: vi.fn(
      async (): Promise<RestoreWorktreeSessionsResult> => ({ items: [] })
    ),
    markPersistent: vi.fn(async () => undefined),
    abandon: vi.fn(async () => undefined),
    sessionKill: vi.fn(async () => undefined),
  },
  terminalRuntimeStateBySessionId: {} as Record<string, 'live' | 'reconnecting' | 'dead'>,
}));

vi.mock('@/stores/settings', () => ({
  BUILTIN_AGENT_IDS: ['claude', 'codex', 'gemini', 'cursor'],
  useSettingsStore: (selector: (state: typeof testState.settings) => unknown) =>
    selector(testState.settings),
}));

vi.mock('@/stores/worktreeActivity', () => ({
  useWorktreeActivityStore: (selector?: (state: typeof testState.worktreeActivity) => unknown) =>
    selector ? selector(testState.worktreeActivity) : testState.worktreeActivity,
}));

vi.mock('@/hooks/useLiveSubagents', () => ({
  areLiveSubagentListsEqual: () => false,
  useLiveSubagents: () => new Map(),
}));

vi.mock('@/hooks/useSessionSubagentsBySession', () => ({
  useSessionSubagentsBySession: () => ({
    itemsBySessionId: {},
  }),
}));

vi.mock('@/lib/electronEnvironment', () => ({
  getRendererEnvironment: () => testState.rendererEnvironment,
}));

vi.mock('@/lib/focusLock', () => ({
  pauseFocusLock: () => () => undefined,
  restoreFocusIfLocked: vi.fn(),
}));

vi.mock('@/lib/ghosttyTheme', () => ({
  defaultDarkTheme: {
    background: '#101014',
    foreground: '#f5f5f5',
  },
  getXtermTheme: () => ({
    background: '#101014',
    foreground: '#f5f5f5',
  }),
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string, vars?: Record<string, string | number>) =>
      value.replace(/\{\{(\w+)\}\}/g, (_match, key) => String(vars?.[key] ?? '')),
  }),
}));

vi.mock('../agentAvailability', () => ({
  probeRemoteAgentAvailability: vi.fn(async (request: { agentId: string }) => ({
    available: true,
    environment: 'native',
    baseId: request.agentId,
  })),
  resolvePersistedInstalledAgents: () => new Set(testState.installedAgents),
  resolveRemoteInstalledAgents: vi.fn(async () => new Set(testState.installedAgents)),
}));

vi.mock('../useAgentCanvasViewportRestore', () => ({
  useAgentCanvasViewportRestore: () => undefined,
}));

vi.mock('../AgentTerminal', () => ({
  AgentTerminal: (props: {
    id?: string;
    isActive?: boolean;
    onRuntimeStateChange?: (state: 'live' | 'reconnecting' | 'dead') => void;
  }) => {
    React.useEffect(() => {
      const sessionId = props.id ?? '';
      const runtimeState = testState.terminalRuntimeStateBySessionId[sessionId];
      if (!runtimeState) {
        return;
      }
      props.onRuntimeStateChange?.(runtimeState);
    }, [props.id, props.onRuntimeStateChange]);

    return React.createElement('div', {
      'data-testid': 'agent-terminal',
      'data-session-id': props.id ?? '',
      'data-active': String(Boolean(props.isActive)),
    });
  },
}));

vi.mock('../AgentGroup', () => ({
  AgentGroup: ({
    group,
    onSessionSelect,
    onSessionClose,
  }: {
    group: { id: string; sessionIds: string[]; activeSessionId: string | null };
    onSessionSelect: (id: string) => void;
    onSessionClose: (id: string) => void;
  }) =>
    React.createElement(
      'div',
      {
        'data-testid': 'agent-group',
        'data-group-id': group.id,
        'data-active-session-id': group.activeSessionId ?? '',
      },
      group.sessionIds.map((sessionId) =>
        React.createElement(
          React.Fragment,
          { key: sessionId },
          React.createElement(
            'button',
            {
              type: 'button',
              'data-testid': `select-session-${sessionId}`,
              onClick: () => onSessionSelect(sessionId),
            },
            `select-${sessionId}`
          ),
          React.createElement(
            'button',
            {
              type: 'button',
              'data-testid': `close-session-${sessionId}`,
              onClick: () => onSessionClose(sessionId),
            },
            `close-${sessionId}`
          )
        )
      )
    ),
}));

vi.mock('../EnhancedInputContainer', () => ({
  EnhancedInputContainer: ({
    sessionId,
    canSend,
    sendLabel,
  }: {
    sessionId: string;
    canSend: boolean;
    sendLabel: string;
  }) =>
    React.createElement('div', {
      'data-testid': 'enhanced-input',
      'data-session-id': sessionId,
      'data-can-send': String(canSend),
      'data-send-label': sendLabel,
    }),
}));

vi.mock('../StatusLine', () => ({
  StatusLine: ({ sessionId }: { sessionId?: string | null }) =>
    React.createElement('div', {
      'data-testid': 'status-line',
      'data-session-id': sessionId ?? '',
    }),
}));

vi.mock('../agent-panel/AgentPanelEmptyState', () => ({
  AgentPanelEmptyState: ({
    defaultAgentLabel,
    enabledAgentCount,
    onStartDefaultSession,
    onStartSessionWithAgent,
    profiles,
  }: {
    defaultAgentLabel: string;
    enabledAgentCount: number;
    onStartDefaultSession: () => void;
    onStartSessionWithAgent: (agentId: string, agentCommand: string) => void;
    profiles: Array<{ agentId: string; command: string }>;
  }) =>
    React.createElement(
      'div',
      {
        'data-testid': 'agent-panel-empty-state',
        'data-default-agent-label': defaultAgentLabel,
        'data-enabled-agent-count': String(enabledAgentCount),
      },
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'start-default-session',
          onClick: onStartDefaultSession,
        },
        'start-default'
      ),
      profiles.map((profile) =>
        React.createElement(
          'button',
          {
            key: profile.agentId,
            type: 'button',
            'data-testid': `start-session-with-agent-${profile.agentId}`,
            onClick: () => onStartSessionWithAgent(profile.agentId, profile.command),
          },
          `start-${profile.agentId}`
        )
      )
    ),
}));

vi.mock('../AgentCloseSessionDialog', () => ({
  AgentCloseSessionDialog: ({
    pendingCloseSession,
    onConfirm,
  }: {
    pendingCloseSession: { id: string; name: string } | null;
    onConfirm: () => void;
  }) =>
    pendingCloseSession
      ? React.createElement(
          'div',
          {
            'data-testid': 'close-session-dialog',
            'data-session-id': pendingCloseSession.id,
            'data-session-name': pendingCloseSession.name,
          },
          React.createElement(
            'button',
            {
              type: 'button',
              'data-testid': 'confirm-close-session',
              onClick: onConfirm,
            },
            'confirm-close'
          )
        )
      : null,
}));

vi.mock('../QuickTerminalModal', () => ({
  QuickTerminalModal: ({
    open,
    backendSessionId,
    onSessionInit,
    onOpenChange,
    onClose,
  }: {
    open: boolean;
    backendSessionId?: string;
    onSessionInit?: (sessionId: string) => void;
    onOpenChange?: (open: boolean) => void;
    onClose?: () => void;
  }) =>
    React.createElement(
      'div',
      {
        'data-testid': 'quick-terminal-modal',
        'data-open': String(open),
        'data-backend-session-id': backendSessionId ?? '',
      },
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'init-quick-terminal-session',
          onClick: () => onSessionInit?.('quick-session-1'),
        },
        'init-quick-terminal'
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'set-quick-terminal-open-false',
          onClick: () => onOpenChange?.(false),
        },
        'set-quick-terminal-open-false'
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'close-quick-terminal',
          onClick: () => onClose?.(),
        },
        'close-quick-terminal'
      )
    ),
}));

vi.mock('../agent-panel/SessionSubagentInspector', () => ({
  SessionSubagentInspector: () => null,
}));

vi.mock('../agent-panel/SessionSubagentTriggerButton', () => ({
  SessionSubagentTriggerButton: () => null,
}));

vi.mock('../SessionPersistenceNotice', () => ({
  SessionPersistenceNotice: () => null,
}));

interface MountedAgentPanel {
  container: HTMLDivElement;
  rerender: (overrides?: Partial<AgentPanelProps>) => Promise<void>;
  unmount: () => Promise<void>;
}

function resetAgentSessionsStore(): void {
  useAgentSessionsStore.setState({
    sessions: [],
    activeIds: {},
    groupStates: {},
    runtimeStates: {},
    enhancedInputStates: {},
    attachmentTrayStates: {},
  });
}

function resetTerminalStore(): void {
  useTerminalStore.setState({
    sessions: [],
    activeSessionId: null,
    quickTerminalSessions: {},
  });
}

function resetEditorStore(): void {
  useEditorStore.setState({
    tabs: [],
    activeTabPath: null,
    pendingCursor: null,
    currentCursorLine: null,
    worktreeStates: {},
    worktreeOrder: [],
    currentWorktreePath: null,
  });
}

function resetAgentStatusStore(): void {
  useAgentStatusStore.setState({
    statuses: {},
  });
}

function resetCodeReviewContinueStore(): void {
  useCodeReviewContinueStore.setState({
    isMinimized: false,
    review: {
      content: '',
      status: 'idle',
      error: null,
      repoPath: null,
      reviewId: null,
      sessionId: null,
    },
    continueConversation: {
      sessionId: null,
      provider: null,
      shouldSwitchToChatTab: false,
    },
  });
}

function resetTodoStore(): void {
  useTodoStore.setState({
    tasks: {},
    _loaded: new Set<string>(),
    _allProjectsLoaded: false,
    autoExecute: {},
  });
}

function createSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    sessionId: 'provider-session-1',
    backendSessionId: 'backend-session-1',
    createdAt: 1,
    name: 'Gemini',
    agentId: 'gemini',
    agentCommand: 'gemini',
    initialized: true,
    activated: true,
    repoPath: '/repo',
    cwd: '/repo/worktree',
    environment: 'native',
    persistenceEnabled: false,
    ...overrides,
  };
}

function createRecoveredRecord(
  overrides: Partial<PersistentAgentSessionRecord> = {}
): PersistentAgentSessionRecord {
  return {
    uiSessionId: 'recovered-session-1',
    backendSessionId: 'backend-recovered-1',
    providerSessionId: 'provider-recovered-1',
    agentId: 'gemini',
    agentCommand: 'gemini',
    environment: 'native',
    repoPath: '/repo',
    cwd: '/repo/worktree',
    displayName: 'Gemini',
    activated: true,
    initialized: true,
    hostKind: 'supervisor',
    hostSessionKey: 'host-recovered-1',
    recoveryPolicy: 'auto',
    createdAt: 1,
    updatedAt: 2,
    lastKnownState: 'live',
    ...overrides,
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

let nextAnimationFrameId = 1;
let animationFrameQueue: Array<{ callback: FrameRequestCallback; id: number }> = [];

function flushAnimationFramesUntilIdle(maxFrameBatches = 1) {
  for (let index = 0; index < maxFrameBatches && animationFrameQueue.length > 0; index += 1) {
    const queue = animationFrameQueue;
    animationFrameQueue = [];

    for (const entry of queue) {
      entry.callback(performance.now());
    }
  }
}

async function flushRenderTasks() {
  await flushMicrotasks();
  flushAnimationFramesUntilIdle();
  await flushMicrotasks();
}

async function clickByTestId(container: HTMLElement, testId: string) {
  const target = container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  expect(target).not.toBeNull();

  await clickElement(target);
}

async function clickElement(target: HTMLElement | null) {
  expect(target).not.toBeNull();

  await act(async () => {
    target?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushRenderTasks();
  });
}

async function mountAgentPanel(
  overrides: Partial<AgentPanelProps> = {}
): Promise<MountedAgentPanel> {
  if (!AgentPanelUnderTest) {
    throw new Error('AgentPanel module was not loaded');
  }
  const AgentPanel = AgentPanelUnderTest;

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  let currentProps: AgentPanelProps = {
    repoPath: '/repo',
    cwd: '/repo/worktree',
    isActive: true,
    ...overrides,
  };

  const render = async (nextOverrides: Partial<AgentPanelProps> = {}) => {
    currentProps = {
      ...currentProps,
      ...nextOverrides,
    };

    await act(async () => {
      root.render(React.createElement(AgentPanel, currentProps));
      await flushRenderTasks();
    });
  };

  await render();

  return {
    container,
    rerender: render,
    unmount: async () => {
      await act(async () => {
        root.unmount();
        await flushRenderTasks();
      });
      container.remove();
    },
  };
}

describe('AgentPanel integration', () => {
  beforeAll(async () => {
    AgentPanelUnderTest = (await import('../AgentPanel')).AgentPanel;
  }, 30_000);

  beforeEach(() => {
    nextAnimationFrameId = 1;
    animationFrameQueue = [];

    localStorage.clear();
    resetWorktreeAgentSessionRecoveryCacheForTests();
    resetAgentSessionsStore();
    resetTerminalStore();
    resetEditorStore();
    resetAgentStatusStore();
    resetCodeReviewContinueStore();
    resetTodoStore();

    testState.installedAgents = ['gemini'];
    testState.rendererEnvironment = {
      platform: 'win32',
      runtimeChannel: 'prod',
    };
    testState.worktreeActivity.setAgentCount.mockReset();
    testState.worktreeActivity.registerAgentCloseHandler.mockReset();
    testState.worktreeActivity.registerAgentCloseHandler.mockImplementation(() => vi.fn());
    testState.worktreeActivity.setDerivedActivityState.mockReset();
    testState.worktreeActivity.clearDerivedActivityState.mockReset();

    testState.settings.agentSettings = {
      claude: { enabled: false, isDefault: false },
      codex: { enabled: false, isDefault: false },
      gemini: { enabled: true, isDefault: true },
      cursor: { enabled: false, isDefault: false },
    };
    testState.settings.customAgents = [];
    testState.settings.autoCreateSessionOnActivate = false;
    testState.settings.autoCreateSessionOnTempActivate = false;
    testState.settings.agentIntegration = {
      tmuxEnabled: false,
      enhancedInputEnabled: true,
      enhancedInputAutoPopup: 'manual',
      statusLineEnabled: true,
      autoSessionRollover: false,
    };
    testState.settings.agentSessionDisplayMode = 'tab';
    testState.settings.backgroundImageEnabled = false;
    testState.settings.confirmBeforeClosingAgentSession = false;
    testState.settings.quickTerminal = {
      enabled: false,
      isOpen: false,
    };
    testState.settings.setAgentIntegration.mockClear();
    testState.settings.setQuickTerminalOpen.mockClear();

    testState.electronAPI.restoreWorktreeSessions.mockReset();
    testState.electronAPI.restoreWorktreeSessions.mockResolvedValue({ items: [] });
    testState.electronAPI.markPersistent.mockReset();
    testState.electronAPI.markPersistent.mockResolvedValue(undefined);
    testState.electronAPI.abandon.mockReset();
    testState.electronAPI.abandon.mockResolvedValue(undefined);
    testState.electronAPI.sessionKill.mockReset();
    testState.electronAPI.sessionKill.mockResolvedValue(undefined);
    testState.terminalRuntimeStateBySessionId = {};

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      writable: true,
      value: {
        agentSession: {
          restoreWorktreeSessions: testState.electronAPI.restoreWorktreeSessions,
          markPersistent: testState.electronAPI.markPersistent,
          abandon: testState.electronAPI.abandon,
        },
        session: {
          kill: testState.electronAPI.sessionKill,
        },
        tmux: {
          check: vi.fn(async () => ({ installed: false })),
          killSession: vi.fn(async () => undefined),
        },
      },
    });

    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserver {
        private readonly callback: ResizeObserverCallback;

        constructor(callback: ResizeObserverCallback) {
          this.callback = callback;
        }

        observe(target: Element) {
          this.callback(
            [
              {
                target,
                contentRect: target.getBoundingClientRect(),
              } as ResizeObserverEntry,
            ],
            this
          );
        }

        unobserve() {}

        disconnect() {}
      }
    );

    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = nextAnimationFrameId++;
      animationFrameQueue.push({ callback, id });
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      animationFrameQueue = animationFrameQueue.filter((entry) => entry.id !== id);
    });
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      media: '',
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }));
  });

  afterEach(() => {
    animationFrameQueue = [];
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('restores recovered worktree sessions into the store and renders the recovered session', async () => {
    testState.electronAPI.restoreWorktreeSessions.mockResolvedValue({
      items: [
        {
          record: createRecoveredRecord(),
          runtimeState: 'live',
          recoverable: true,
        },
      ],
    });

    const mounted = await mountAgentPanel();
    const store = useAgentSessionsStore.getState();

    expect(testState.electronAPI.restoreWorktreeSessions).toHaveBeenCalledWith({
      repoPath: '/repo',
      cwd: '/repo/worktree',
    });
    expect(store.sessions).toEqual([
      expect.objectContaining({
        id: 'recovered-session-1',
        repoPath: '/repo',
        cwd: '/repo/worktree',
        agentId: 'gemini',
        recovered: true,
      }),
    ]);
    expect(store.activeIds['/repo/worktree']).toBe('recovered-session-1');
    expect(store.getGroupState('/repo/worktree')).toEqual({
      groups: [
        expect.objectContaining({
          sessionIds: ['recovered-session-1'],
          activeSessionId: 'recovered-session-1',
        }),
      ],
      activeGroupId: expect.any(String),
      flexPercents: [100],
    });
    expect(
      mounted.container.querySelector(
        '[data-testid="agent-terminal"][data-session-id="recovered-session-1"]'
      )
    ).not.toBeNull();

    await mounted.unmount();
  }, 20_000);

  it('preserves unresolved missing-host recovery state when the mounted terminal reports live by default', async () => {
    testState.electronAPI.restoreWorktreeSessions.mockResolvedValue({
      items: [
        {
          record: createRecoveredRecord({
            uiSessionId: 'recovered-missing-1',
            backendSessionId: undefined,
            providerSessionId: 'recovered-missing-1',
            agentId: 'codex',
            agentCommand: 'codex',
            hostKind: 'tmux',
            hostSessionKey: 'infilux-recovered-missing-1',
            lastKnownState: 'missing-host-session',
          }),
          runtimeState: 'missing-host-session',
          recoverable: false,
          reason: 'missing-host-session',
        },
      ],
    });
    testState.terminalRuntimeStateBySessionId['recovered-missing-1'] = 'live';

    const mounted = await mountAgentPanel();
    const recoveredSession = useAgentSessionsStore
      .getState()
      .sessions.find((session) => session.id === 'recovered-missing-1');

    expect(recoveredSession?.recoveryState).toBe('missing-host-session');

    await mounted.unmount();
  });

  it('does not run panel-scoped recovery while hosting the workspace canvas', async () => {
    testState.settings.agentSessionDisplayMode = 'global-canvas';

    const mounted = await mountAgentPanel({
      cwd: '/repo/worktree-a',
      workspaceCanvasWorktrees: [
        { repoPath: '/repo', worktreePath: '/repo/worktree-a' },
        { repoPath: '/repo', worktreePath: '/repo/worktree-b' },
      ],
    });

    expect(testState.electronAPI.restoreWorktreeSessions).not.toHaveBeenCalled();

    await mounted.rerender({
      cwd: '/repo/worktree-b',
      canvasRecenterOnActivateToken: 1,
      canvasRecenterWorktreePath: '/repo/worktree-b',
    });

    expect(testState.electronAPI.restoreWorktreeSessions).not.toHaveBeenCalled();

    await mounted.unmount();
  });

  it('does not run panel-scoped recovery for retained non-current worktree panels', async () => {
    const mounted = await mountAgentPanel({
      isActive: false,
      isCurrentWorktreePanel: false,
    });

    expect(testState.electronAPI.restoreWorktreeSessions).not.toHaveBeenCalled();

    await mounted.rerender({
      isCurrentWorktreePanel: true,
    });

    expect(testState.electronAPI.restoreWorktreeSessions).toHaveBeenCalledWith({
      repoPath: '/repo',
      cwd: '/repo/worktree',
    });

    await mounted.unmount();
  });

  it('creates a default session from the empty state and attaches it to the first group', async () => {
    const mounted = await mountAgentPanel();

    expect(
      mounted.container.querySelector('[data-testid="agent-panel-empty-state"]')
    ).not.toBeNull();
    expect(
      mounted.container
        .querySelector('[data-testid="agent-panel-empty-state"]')
        ?.getAttribute('data-enabled-agent-count')
    ).toBe('1');

    await clickByTestId(mounted.container, 'start-default-session');

    const store = useAgentSessionsStore.getState();
    expect(store.sessions).toHaveLength(1);
    const session = store.sessions[0];
    expect(session).toMatchObject({
      repoPath: '/repo',
      cwd: '/repo/worktree',
      agentId: 'gemini',
      agentCommand: 'gemini',
      initialized: false,
    });
    expect(store.getGroupState('/repo/worktree')).toEqual({
      groups: [
        expect.objectContaining({
          sessionIds: [session.id],
          activeSessionId: session.id,
        }),
      ],
      activeGroupId: expect.any(String),
      flexPercents: [100],
    });
    expect(
      mounted.container.querySelector(
        `[data-testid="agent-terminal"][data-session-id="${session.id}"]`
      )
    ).not.toBeNull();

    await mounted.unmount();
  });

  it('falls back to the first enabled builtin agent when no default agent is configured', async () => {
    testState.installedAgents = ['codex'];
    testState.settings.agentSettings = {
      claude: { enabled: false, isDefault: false },
      codex: { enabled: true, isDefault: false },
      gemini: { enabled: false, isDefault: false },
      cursor: { enabled: false, isDefault: false },
    };

    const mounted = await mountAgentPanel();

    await clickByTestId(mounted.container, 'start-default-session');

    const store = useAgentSessionsStore.getState();
    expect(store.sessions).toHaveLength(1);
    const session = store.sessions[0];
    expect(session).toMatchObject({
      agentId: 'codex',
      agentCommand: 'codex',
    });

    await mounted.unmount();
  });

  it('creates a session for the selected empty-state profile', async () => {
    testState.installedAgents = ['gemini', 'claude'];
    testState.settings.agentSettings = {
      claude: { enabled: true, isDefault: false },
      codex: { enabled: false, isDefault: false },
      gemini: { enabled: true, isDefault: true },
      cursor: { enabled: false, isDefault: false },
    };

    const mounted = await mountAgentPanel();

    await clickByTestId(mounted.container, 'start-session-with-agent-claude');

    const store = useAgentSessionsStore.getState();
    expect(store.sessions).toHaveLength(1);
    const session = store.sessions[0];
    expect(session).toMatchObject({
      repoPath: '/repo',
      cwd: '/repo/worktree',
      agentId: 'claude',
      agentCommand: 'claude',
    });
    expect(store.getGroupState('/repo/worktree')).toEqual({
      groups: [
        expect.objectContaining({
          sessionIds: [session.id],
          activeSessionId: session.id,
        }),
      ],
      activeGroupId: expect.any(String),
      flexPercents: [100],
    });

    await mounted.unmount();
  });

  it('rebinds the bottom bar to the newly selected session', async () => {
    const firstSession = createSession({
      id: 'session-a',
      sessionId: 'provider-a',
      backendSessionId: 'backend-a',
      name: 'Gemini A',
    });
    const secondSession = createSession({
      id: 'session-b',
      sessionId: 'provider-b',
      backendSessionId: 'backend-b',
      name: 'Gemini B',
    });
    useAgentSessionsStore.setState({
      sessions: [firstSession, secondSession],
      activeIds: {
        '/repo/worktree': firstSession.id,
      },
      groupStates: {
        '/repo/worktree': {
          groups: [
            {
              id: 'group-1',
              sessionIds: [firstSession.id, secondSession.id],
              activeSessionId: firstSession.id,
            },
          ],
          activeGroupId: 'group-1',
          flexPercents: [100],
        },
      },
    });

    const mounted = await mountAgentPanel();

    expect(
      mounted.container
        .querySelector('[data-testid="enhanced-input"]')
        ?.getAttribute('data-session-id')
    ).toBe('session-a');
    expect(
      mounted.container
        .querySelector('[data-testid="status-line"]')
        ?.getAttribute('data-session-id')
    ).toBe('session-a');

    await clickByTestId(mounted.container, 'select-session-session-b');

    const store = useAgentSessionsStore.getState();
    expect(store.activeIds['/repo/worktree']).toBe('session-b');
    expect(store.getGroupState('/repo/worktree').groups[0]?.activeSessionId).toBe('session-b');
    expect(
      mounted.container
        .querySelector('[data-testid="enhanced-input"]')
        ?.getAttribute('data-session-id')
    ).toBe('session-b');
    expect(
      mounted.container
        .querySelector('[data-testid="status-line"]')
        ?.getAttribute('data-session-id')
    ).toBe('session-b');

    await mounted.unmount();
  });

  it('does not activate workspace canvas terminals when the current worktree changes', async () => {
    testState.settings.agentSessionDisplayMode = 'global-canvas';

    const firstSession = createSession({
      id: 'session-worktree-a',
      sessionId: 'provider-worktree-a',
      backendSessionId: undefined,
      cwd: '/repo/worktree-a',
      name: 'Gemini A',
    });
    const secondSession = createSession({
      id: 'session-worktree-b',
      sessionId: 'provider-worktree-b',
      backendSessionId: undefined,
      cwd: '/repo/worktree-b',
      name: 'Gemini B',
    });

    useAgentSessionsStore.setState({
      sessions: [firstSession, secondSession],
      activeIds: {
        '/repo/worktree-a': firstSession.id,
        '/repo/worktree-b': secondSession.id,
      },
      groupStates: {
        '/repo/worktree-a': {
          groups: [
            {
              id: 'group-worktree-a',
              sessionIds: [firstSession.id],
              activeSessionId: firstSession.id,
            },
          ],
          activeGroupId: 'group-worktree-a',
          flexPercents: [100],
        },
        '/repo/worktree-b': {
          groups: [
            {
              id: 'group-worktree-b',
              sessionIds: [secondSession.id],
              activeSessionId: secondSession.id,
            },
          ],
          activeGroupId: 'group-worktree-b',
          flexPercents: [100],
        },
      },
    });

    const mounted = await mountAgentPanel({
      cwd: '/repo/worktree-a',
      workspaceCanvasWorktrees: [
        { repoPath: '/repo', worktreePath: '/repo/worktree-a' },
        { repoPath: '/repo', worktreePath: '/repo/worktree-b' },
      ],
    });

    expect(
      mounted.container
        .querySelector('[data-session-id="session-worktree-a"]')
        ?.getAttribute('data-active')
    ).toBe('false');
    expect(
      mounted.container
        .querySelector('[data-session-id="session-worktree-b"]')
        ?.getAttribute('data-active')
    ).toBe('false');

    await mounted.rerender({
      cwd: '/repo/worktree-b',
      canvasRecenterOnActivateToken: 1,
      canvasRecenterWorktreePath: '/repo/worktree-b',
    });

    expect(
      mounted.container
        .querySelector('[data-session-id="session-worktree-a"]')
        ?.getAttribute('data-active')
    ).toBe('false');
    expect(
      mounted.container
        .querySelector('[data-session-id="session-worktree-b"]')
        ?.getAttribute('data-active')
    ).toBe('false');

    await mounted.unmount();
  });

  it('marks workspace canvas session tiles with their own activity state without polluting current worktree activity', async () => {
    testState.settings.agentSessionDisplayMode = 'global-canvas';

    const firstSession = createSession({
      id: 'session-worktree-a',
      sessionId: 'provider-worktree-a',
      backendSessionId: undefined,
      cwd: '/repo/worktree-a',
      name: 'Gemini A',
    });
    const secondSession = createSession({
      id: 'session-worktree-b',
      sessionId: 'provider-worktree-b',
      backendSessionId: undefined,
      cwd: '/repo/worktree-b',
      name: 'Gemini B',
    });

    useAgentSessionsStore.setState({
      sessions: [firstSession, secondSession],
      activeIds: {
        '/repo/worktree-a': firstSession.id,
        '/repo/worktree-b': secondSession.id,
      },
      groupStates: {
        '/repo/worktree-a': {
          groups: [
            {
              id: 'group-worktree-a',
              sessionIds: [firstSession.id],
              activeSessionId: firstSession.id,
            },
          ],
          activeGroupId: 'group-worktree-a',
          flexPercents: [100],
        },
        '/repo/worktree-b': {
          groups: [
            {
              id: 'group-worktree-b',
              sessionIds: [secondSession.id],
              activeSessionId: secondSession.id,
            },
          ],
          activeGroupId: 'group-worktree-b',
          flexPercents: [100],
        },
      },
      runtimeStates: {
        [secondSession.id]: {
          outputState: 'idle',
          lastActivityAt: 1,
          wasActiveWhenOutputting: false,
          waitingForInput: false,
          hasCompletedTaskUnread: true,
        },
      },
    });

    const mounted = await mountAgentPanel({
      cwd: '/repo/worktree-a',
      workspaceCanvasWorktrees: [
        { repoPath: '/repo', worktreePath: '/repo/worktree-a' },
        { repoPath: '/repo', worktreePath: '/repo/worktree-b' },
      ],
    });

    const currentTile = mounted.container.querySelector(
      '[data-agent-session-id="session-worktree-a"]'
    );
    const otherTile = mounted.container.querySelector(
      '[data-agent-session-id="session-worktree-b"]'
    );

    expect(currentTile?.getAttribute('data-agent-activity-state')).toBe('idle');
    expect(otherTile?.getAttribute('data-agent-activity-state')).toBe('completed');
    expect(testState.worktreeActivity.setDerivedActivityState).toHaveBeenLastCalledWith(
      '/repo/worktree-a',
      'idle'
    );

    await mounted.unmount();
  });

  it('orders workspace canvas worktree groups by session activity', async () => {
    testState.settings.agentSessionDisplayMode = 'global-canvas';

    const idleSession = createSession({
      id: 'session-idle',
      sessionId: 'provider-idle',
      backendSessionId: undefined,
      cwd: '/repo/worktree-a',
      name: 'Gemini Idle',
    });
    const secondIdleSession = createSession({
      id: 'session-second-idle',
      sessionId: 'provider-second-idle',
      backendSessionId: undefined,
      cwd: '/repo/worktree-b',
      name: 'Gemini Second Idle',
    });
    const completedSession = createSession({
      id: 'session-completed',
      sessionId: 'provider-completed',
      backendSessionId: undefined,
      cwd: '/repo/worktree-c',
      name: 'Gemini Completed',
    });

    useAgentSessionsStore.setState({
      sessions: [idleSession, secondIdleSession, completedSession],
      activeIds: {
        '/repo/worktree-a': idleSession.id,
        '/repo/worktree-b': secondIdleSession.id,
        '/repo/worktree-c': completedSession.id,
      },
      groupStates: {
        '/repo/worktree-a': {
          groups: [
            {
              id: 'group-idle',
              sessionIds: [idleSession.id],
              activeSessionId: idleSession.id,
            },
          ],
          activeGroupId: 'group-idle',
          flexPercents: [100],
        },
        '/repo/worktree-b': {
          groups: [
            {
              id: 'group-second-idle',
              sessionIds: [secondIdleSession.id],
              activeSessionId: secondIdleSession.id,
            },
          ],
          activeGroupId: 'group-second-idle',
          flexPercents: [100],
        },
        '/repo/worktree-c': {
          groups: [
            {
              id: 'group-completed',
              sessionIds: [completedSession.id],
              activeSessionId: completedSession.id,
            },
          ],
          activeGroupId: 'group-completed',
          flexPercents: [100],
        },
      },
      runtimeStates: {
        [completedSession.id]: {
          outputState: 'idle',
          lastActivityAt: 1,
          wasActiveWhenOutputting: false,
          hasCompletedTaskUnread: true,
        },
      },
    });

    const mounted = await mountAgentPanel({
      cwd: '/repo/worktree-a',
      workspaceCanvasWorktrees: [
        { repoPath: '/repo', worktreePath: '/repo/worktree-a' },
        { repoPath: '/repo', worktreePath: '/repo/worktree-b' },
        { repoPath: '/repo', worktreePath: '/repo/worktree-c' },
      ],
    });

    expect(
      Array.from(mounted.container.querySelectorAll('[data-agent-canvas-worktree-group]')).map(
        (group) => group.getAttribute('data-agent-canvas-worktree-path')
      )
    ).toEqual(['/repo/worktree-c', '/repo/worktree-a', '/repo/worktree-b']);

    await mounted.unmount();
  });

  it('orders idle workspace canvas groups by recent activity without current worktree churn', async () => {
    testState.settings.agentSessionDisplayMode = 'global-canvas';

    const currentSession = createSession({
      id: 'session-current-idle',
      sessionId: 'provider-current-idle',
      backendSessionId: undefined,
      cwd: '/repo/worktree-a',
      name: 'Gemini Current Idle',
    });
    const olderSession = createSession({
      id: 'session-older-idle',
      sessionId: 'provider-older-idle',
      backendSessionId: undefined,
      cwd: '/repo/worktree-b',
      name: 'Gemini Older Idle',
    });
    const newerSession = createSession({
      id: 'session-newer-idle',
      sessionId: 'provider-newer-idle',
      backendSessionId: undefined,
      cwd: '/repo/worktree-c',
      name: 'Gemini Newer Idle',
    });

    useAgentSessionsStore.setState({
      sessions: [currentSession, olderSession, newerSession],
      activeIds: {
        '/repo/worktree-a': currentSession.id,
        '/repo/worktree-b': olderSession.id,
        '/repo/worktree-c': newerSession.id,
      },
      groupStates: {
        '/repo/worktree-a': {
          groups: [
            {
              id: 'group-current-idle',
              sessionIds: [currentSession.id],
              activeSessionId: currentSession.id,
            },
          ],
          activeGroupId: 'group-current-idle',
          flexPercents: [100],
        },
        '/repo/worktree-b': {
          groups: [
            {
              id: 'group-older-idle',
              sessionIds: [olderSession.id],
              activeSessionId: olderSession.id,
            },
          ],
          activeGroupId: 'group-older-idle',
          flexPercents: [100],
        },
        '/repo/worktree-c': {
          groups: [
            {
              id: 'group-newer-idle',
              sessionIds: [newerSession.id],
              activeSessionId: newerSession.id,
            },
          ],
          activeGroupId: 'group-newer-idle',
          flexPercents: [100],
        },
      },
      runtimeStates: {
        [currentSession.id]: {
          outputState: 'idle',
          lastActivityAt: 10,
          wasActiveWhenOutputting: false,
        },
        [olderSession.id]: {
          outputState: 'idle',
          lastActivityAt: 20,
          wasActiveWhenOutputting: false,
        },
        [newerSession.id]: {
          outputState: 'idle',
          lastActivityAt: 30,
          wasActiveWhenOutputting: false,
        },
      },
    });

    const mounted = await mountAgentPanel({
      cwd: '/repo/worktree-a',
      workspaceCanvasWorktrees: [
        { repoPath: '/repo', worktreePath: '/repo/worktree-a' },
        { repoPath: '/repo', worktreePath: '/repo/worktree-b' },
        { repoPath: '/repo', worktreePath: '/repo/worktree-c' },
      ],
    });

    expect(
      Array.from(mounted.container.querySelectorAll('[data-agent-canvas-worktree-group]')).map(
        (group) => group.getAttribute('data-agent-canvas-worktree-path')
      )
    ).toEqual(['/repo/worktree-c', '/repo/worktree-b', '/repo/worktree-a']);

    await mounted.unmount();
  });

  it('activates a workspace canvas session launched from a worktree group', async () => {
    testState.settings.agentSessionDisplayMode = 'global-canvas';

    const existingSession = createSession({
      id: 'session-existing-worktree-a',
      sessionId: 'provider-existing-worktree-a',
      backendSessionId: undefined,
      cwd: '/repo/worktree-a',
      name: 'Gemini A',
    });

    useAgentSessionsStore.setState({
      sessions: [existingSession],
      activeIds: {
        '/repo/worktree-a': existingSession.id,
      },
      groupStates: {
        '/repo/worktree-a': {
          groups: [
            {
              id: 'group-existing-worktree-a',
              sessionIds: [existingSession.id],
              activeSessionId: existingSession.id,
            },
          ],
          activeGroupId: 'group-existing-worktree-a',
          flexPercents: [100],
        },
      },
    });

    const mounted = await mountAgentPanel({
      cwd: '/repo/worktree-a',
      workspaceCanvasWorktrees: [
        { repoPath: '/repo', worktreePath: '/repo/worktree-a' },
        { repoPath: '/repo', worktreePath: '/repo/worktree-b' },
      ],
    });

    await clickElement(
      mounted.container.querySelector('button[aria-label="New Session in worktree-b"]')
    );

    const launchedSession = useAgentSessionsStore
      .getState()
      .sessions.find((session) => session.cwd === '/repo/worktree-b');

    expect(launchedSession).toEqual(expect.objectContaining({ cwd: '/repo/worktree-b' }));
    expect(
      mounted.container
        .querySelector(`[data-session-id="${launchedSession?.id}"]`)
        ?.getAttribute('data-active')
    ).toBe('true');

    await mounted.unmount();
  });

  it('uses the launch target worktree when probing remote workspace canvas sessions', async () => {
    testState.settings.agentSessionDisplayMode = 'global-canvas';

    const { probeRemoteAgentAvailability } = await import('../agentAvailability');
    const probeRemoteAgentAvailabilityMock = vi.mocked(probeRemoteAgentAvailability);
    probeRemoteAgentAvailabilityMock.mockClear();

    const remoteRepoPath = toRemoteVirtualPath('connection-1', '/srv/repo');
    const remoteWorktreePath = toRemoteVirtualPath('connection-1', '/srv/repo/worktrees/feature-a');

    const mounted = await mountAgentPanel({
      cwd: '/repo/worktree-a',
      workspaceCanvasWorktrees: [
        { repoPath: '/repo', worktreePath: '/repo/worktree-a' },
        { repoPath: remoteRepoPath, worktreePath: remoteWorktreePath },
      ],
    });

    await clickElement(
      mounted.container.querySelector('button[aria-label="New Session in feature-a"]')
    );

    const launchedSession = useAgentSessionsStore
      .getState()
      .sessions.find((session) => session.cwd === remoteWorktreePath);

    expect(probeRemoteAgentAvailabilityMock).toHaveBeenCalledTimes(1);
    expect(launchedSession).toEqual(
      expect.objectContaining({
        repoPath: remoteRepoPath,
        cwd: remoteWorktreePath,
        persistenceEnabled: false,
      })
    );

    await mounted.unmount();
  });

  it('keeps a floating workspace canvas session open for non-current worktrees', async () => {
    testState.settings.agentSessionDisplayMode = 'global-canvas';

    const firstSession = createSession({
      id: 'session-worktree-a',
      sessionId: 'provider-worktree-a',
      backendSessionId: undefined,
      cwd: '/repo/worktree-a',
      name: 'Gemini A',
    });
    const secondSession = createSession({
      id: 'session-worktree-b',
      sessionId: 'provider-worktree-b',
      backendSessionId: undefined,
      cwd: '/repo/worktree-b',
      name: 'Gemini B',
    });

    useAgentSessionsStore.setState({
      sessions: [firstSession, secondSession],
      activeIds: {
        '/repo/worktree-a': firstSession.id,
        '/repo/worktree-b': secondSession.id,
      },
      groupStates: {
        '/repo/worktree-a': {
          groups: [
            {
              id: 'group-worktree-a',
              sessionIds: [firstSession.id],
              activeSessionId: firstSession.id,
            },
          ],
          activeGroupId: 'group-worktree-a',
          flexPercents: [100],
        },
        '/repo/worktree-b': {
          groups: [
            {
              id: 'group-worktree-b',
              sessionIds: [secondSession.id],
              activeSessionId: secondSession.id,
            },
          ],
          activeGroupId: 'group-worktree-b',
          flexPercents: [100],
        },
      },
    });

    const mounted = await mountAgentPanel({
      cwd: '/repo/worktree-a',
      workspaceCanvasWorktrees: [
        { repoPath: '/repo', worktreePath: '/repo/worktree-a' },
        { repoPath: '/repo', worktreePath: '/repo/worktree-b' },
      ],
    });

    const secondTile = mounted.container.querySelector(
      '[data-agent-session-id="session-worktree-b"]'
    );
    await clickElement(secondTile?.querySelector('button[aria-label="Bring to Front"]') ?? null);

    expect(document.body.querySelector('.agent-canvas-floating-frame')).not.toBeNull();

    await mounted.unmount();
  });

  it('counts every visible workspace canvas session in the control center', async () => {
    testState.settings.agentSessionDisplayMode = 'global-canvas';

    const currentRepoSession = createSession({
      id: 'session-current-repo',
      sessionId: 'provider-current-repo',
      repoPath: '/repo',
      cwd: '/repo/worktree-a',
      name: 'Current Repo Session',
    });
    const otherRepoSession = createSession({
      id: 'session-other-repo',
      sessionId: 'provider-other-repo',
      repoPath: '/other',
      cwd: '/other/worktree',
      name: 'Other Repo Session',
    });

    useAgentSessionsStore.setState({
      sessions: [currentRepoSession, otherRepoSession],
      activeIds: {
        '/repo/worktree-a': currentRepoSession.id,
        '/other/worktree': otherRepoSession.id,
      },
      groupStates: {
        '/repo/worktree-a': {
          groups: [
            {
              id: 'group-current-repo',
              sessionIds: [currentRepoSession.id],
              activeSessionId: currentRepoSession.id,
            },
          ],
          activeGroupId: 'group-current-repo',
          flexPercents: [100],
        },
        '/other/worktree': {
          groups: [
            {
              id: 'group-other-repo',
              sessionIds: [otherRepoSession.id],
              activeSessionId: otherRepoSession.id,
            },
          ],
          activeGroupId: 'group-other-repo',
          flexPercents: [100],
        },
      },
    });

    const mounted = await mountAgentPanel({
      cwd: '/repo/worktree-a',
      workspaceCanvasWorktrees: [
        { repoPath: '/repo', worktreePath: '/repo/worktree-a' },
        { repoPath: '/other', worktreePath: '/other/worktree' },
      ],
    });

    const controlButton = mounted.container.querySelector('button[aria-label="Agent Sessions"]');

    expect(controlButton?.textContent).toContain('2');

    await mounted.unmount();
  });

  it('syncs workspace canvas agent counts for non-current worktrees', async () => {
    testState.settings.agentSessionDisplayMode = 'global-canvas';

    const currentSession = createSession({
      id: 'session-worktree-a',
      sessionId: 'provider-worktree-a',
      backendSessionId: undefined,
      cwd: '/repo/worktree-a',
      name: 'Gemini A',
    });
    const otherSession = createSession({
      id: 'session-worktree-b',
      sessionId: 'provider-worktree-b',
      backendSessionId: undefined,
      cwd: '/repo/worktree-b',
      name: 'Gemini B',
    });

    useAgentSessionsStore.setState({
      sessions: [currentSession, otherSession],
      activeIds: {
        '/repo/worktree-a': currentSession.id,
        '/repo/worktree-b': otherSession.id,
      },
      groupStates: {
        '/repo/worktree-a': {
          groups: [
            {
              id: 'group-worktree-a',
              sessionIds: [currentSession.id],
              activeSessionId: currentSession.id,
            },
          ],
          activeGroupId: 'group-worktree-a',
          flexPercents: [100],
        },
        '/repo/worktree-b': {
          groups: [
            {
              id: 'group-worktree-b',
              sessionIds: [otherSession.id],
              activeSessionId: otherSession.id,
            },
          ],
          activeGroupId: 'group-worktree-b',
          flexPercents: [100],
        },
      },
    });

    const mounted = await mountAgentPanel({
      cwd: '/repo/worktree-a',
      workspaceCanvasWorktrees: [
        { repoPath: '/repo', worktreePath: '/repo/worktree-a' },
        { repoPath: '/repo', worktreePath: '/repo/worktree-b' },
      ],
    });

    expect(testState.worktreeActivity.setAgentCount).toHaveBeenCalledWith('/repo/worktree-a', 1);
    expect(testState.worktreeActivity.setAgentCount).toHaveBeenCalledWith('/repo/worktree-b', 1);

    await mounted.unmount();
  });

  it('clears workspace canvas agent counts for visible worktrees without initialized sessions', async () => {
    testState.settings.agentSessionDisplayMode = 'global-canvas';

    const currentSession = createSession({
      id: 'session-worktree-a',
      sessionId: 'provider-worktree-a',
      backendSessionId: undefined,
      cwd: '/repo/worktree-a',
      name: 'Gemini A',
    });

    useAgentSessionsStore.setState({
      sessions: [currentSession],
      activeIds: {
        '/repo/worktree-a': currentSession.id,
      },
      groupStates: {
        '/repo/worktree-a': {
          groups: [
            {
              id: 'group-worktree-a',
              sessionIds: [currentSession.id],
              activeSessionId: currentSession.id,
            },
          ],
          activeGroupId: 'group-worktree-a',
          flexPercents: [100],
        },
      },
    });

    const mounted = await mountAgentPanel({
      cwd: '/repo/worktree-a',
      workspaceCanvasWorktrees: [
        { repoPath: '/repo', worktreePath: '/repo/worktree-a' },
        { repoPath: '/repo', worktreePath: '/repo/worktree-b' },
      ],
    });

    expect(testState.worktreeActivity.setAgentCount).toHaveBeenCalledWith('/repo/worktree-a', 1);
    expect(testState.worktreeActivity.setAgentCount).toHaveBeenCalledWith('/repo/worktree-b', 0);

    await mounted.unmount();
  });

  it('omits sessions from workspace canvas when their worktree is outside the canvas candidate set', async () => {
    testState.settings.agentSessionDisplayMode = 'global-canvas';

    const attachedSession = createSession({
      id: 'session-attached',
      sessionId: 'provider-attached',
      repoPath: '/repo',
      cwd: '/repo/worktree-a',
      name: 'Attached Session',
    });
    const removedSession = createSession({
      id: 'session-removed',
      sessionId: 'provider-removed',
      repoPath: '/removed',
      cwd: '/removed/worktree',
      name: 'Removed Session',
    });

    useAgentSessionsStore.setState({
      sessions: [attachedSession, removedSession],
      activeIds: {
        '/repo/worktree-a': attachedSession.id,
        '/removed/worktree': removedSession.id,
      },
      groupStates: {
        '/repo/worktree-a': {
          groups: [
            {
              id: 'group-attached',
              sessionIds: [attachedSession.id],
              activeSessionId: attachedSession.id,
            },
          ],
          activeGroupId: 'group-attached',
          flexPercents: [100],
        },
        '/removed/worktree': {
          groups: [
            {
              id: 'group-removed',
              sessionIds: [removedSession.id],
              activeSessionId: removedSession.id,
            },
          ],
          activeGroupId: 'group-removed',
          flexPercents: [100],
        },
      },
    });

    const mounted = await mountAgentPanel({
      cwd: '/repo/worktree-a',
      workspaceCanvasWorktrees: [{ repoPath: '/repo', worktreePath: '/repo/worktree-a' }],
    });

    expect(
      mounted.container.querySelector('[data-agent-session-id="session-attached"]')
    ).not.toBeNull();
    expect(mounted.container.querySelector('[data-agent-session-id="session-removed"]')).toBeNull();

    await mounted.unmount();
  });

  it('attaches cross-repository task summaries in the workspace canvas control center', async () => {
    testState.settings.agentSessionDisplayMode = 'global-canvas';

    const currentRepoSession = createSession({
      id: 'session-current-repo',
      sessionId: 'provider-current-repo',
      repoPath: '/repo',
      cwd: '/repo/worktree-a',
      name: 'Current Repo Session',
    });
    const otherRepoSession = createSession({
      id: 'session-other-repo',
      sessionId: 'provider-other-repo',
      repoPath: '/other',
      cwd: '/other/worktree',
      name: 'Other Repo Session',
    });

    useAgentSessionsStore.setState({
      sessions: [currentRepoSession, otherRepoSession],
      activeIds: {
        '/repo/worktree-a': currentRepoSession.id,
        '/other/worktree': otherRepoSession.id,
      },
      groupStates: {
        '/repo/worktree-a': {
          groups: [
            {
              id: 'group-current-repo',
              sessionIds: [currentRepoSession.id],
              activeSessionId: currentRepoSession.id,
            },
          ],
          activeGroupId: 'group-current-repo',
          flexPercents: [100],
        },
        '/other/worktree': {
          groups: [
            {
              id: 'group-other-repo',
              sessionIds: [otherRepoSession.id],
              activeSessionId: otherRepoSession.id,
            },
          ],
          activeGroupId: 'group-other-repo',
          flexPercents: [100],
        },
      },
    });
    useTodoStore.setState({
      tasks: {
        '/repo': [
          {
            id: 'task-current',
            title: 'Current repo task',
            description: '',
            priority: 'medium',
            status: 'in-progress',
            createdAt: 1,
            updatedAt: 1,
            order: 0,
            sessionId: currentRepoSession.id,
          },
        ],
        '/other': [
          {
            id: 'task-other',
            title: 'Other repo task',
            description: '',
            priority: 'high',
            status: 'in-progress',
            createdAt: 1,
            updatedAt: 1,
            order: 0,
            sessionId: otherRepoSession.id,
          },
        ],
      },
    });

    const mounted = await mountAgentPanel({
      cwd: '/repo/worktree-a',
      workspaceCanvasWorktrees: [
        { repoPath: '/repo', worktreePath: '/repo/worktree-a' },
        { repoPath: '/other', worktreePath: '/other/worktree' },
      ],
    });

    await clickElement(mounted.container.querySelector('button[aria-label="Agent Sessions"]'));

    expect(document.body.textContent).toContain('Task: Current repo task');
    expect(document.body.textContent).toContain('Task: Other repo task');

    await mounted.unmount();
  });

  it('keeps every workspace canvas tile visible while limiting mounted terminals', async () => {
    testState.settings.agentSessionDisplayMode = 'global-canvas';

    const sessions = Array.from({ length: 14 }, (_, index) =>
      createSession({
        id: `session-${index}`,
        sessionId: `provider-${index}`,
        backendSessionId: `backend-${index}`,
        repoPath: '/repo',
        cwd: `/repo/worktree-${index}`,
        name: `Gemini ${index}`,
      })
    );

    useAgentSessionsStore.setState({
      sessions,
      activeIds: Object.fromEntries(sessions.map((session) => [session.cwd, session.id])),
      groupStates: Object.fromEntries(
        sessions.map((session, index) => [
          session.cwd,
          {
            groups: [
              {
                id: `group-${index}`,
                sessionIds: [session.id],
                activeSessionId: session.id,
              },
            ],
            activeGroupId: `group-${index}`,
            flexPercents: [100],
          },
        ])
      ),
    });

    const mounted = await mountAgentPanel({
      cwd: '/repo/worktree-0',
      workspaceCanvasWorktrees: sessions.map((session) => ({
        repoPath: session.repoPath,
        worktreePath: session.cwd,
      })),
    });

    expect(mounted.container.querySelectorAll('[data-agent-session-id]')).toHaveLength(14);
    expect(mounted.container.querySelectorAll('[data-testid="agent-terminal"]')).toHaveLength(12);

    const deferredTile = mounted.container.querySelector<HTMLElement>(
      '[data-agent-canvas-deferred="true"]'
    );
    const deferredSessionId = deferredTile?.getAttribute('data-agent-session-id');
    const openDeferredTileButton =
      deferredTile?.querySelector<HTMLElement>('button[aria-label="Bring to Front"]') ?? null;
    await clickElement(openDeferredTileButton);

    expect(
      document.body.querySelector(
        `[data-testid="agent-terminal"][data-session-id="${deferredSessionId}"]`
      )
    ).not.toBeNull();
    expect(document.body.querySelectorAll('[data-testid="agent-terminal"]')).toHaveLength(12);

    await mounted.unmount();
  });

  it('keeps workspace canvas terminal mounts stable when switching the current worktree', async () => {
    testState.settings.agentSessionDisplayMode = 'global-canvas';

    const sessions = Array.from({ length: 14 }, (_, index) =>
      createSession({
        id: `session-${index}`,
        sessionId: `provider-${index}`,
        backendSessionId: `backend-${index}`,
        repoPath: '/repo',
        cwd: `/repo/worktree-${index}`,
        name: `Gemini ${index}`,
      })
    );

    useAgentSessionsStore.setState({
      sessions,
      activeIds: Object.fromEntries(sessions.map((session) => [session.cwd, session.id])),
      groupStates: Object.fromEntries(
        sessions.map((session, index) => [
          session.cwd,
          {
            groups: [
              {
                id: `group-${index}`,
                sessionIds: [session.id],
                activeSessionId: session.id,
              },
            ],
            activeGroupId: `group-${index}`,
            flexPercents: [100],
          },
        ])
      ),
    });

    const mounted = await mountAgentPanel({
      cwd: '/repo/worktree-0',
      workspaceCanvasWorktrees: sessions.map((session) => ({
        repoPath: session.repoPath,
        worktreePath: session.cwd,
      })),
    });
    const getMountedSessionIds = () =>
      Array.from(mounted.container.querySelectorAll('[data-testid="agent-terminal"]'))
        .map((terminal) => terminal.getAttribute('data-session-id'))
        .filter((sessionId): sessionId is string => sessionId !== null);

    const mountedSessionIdsBeforeSwitch = getMountedSessionIds();

    await mounted.rerender({
      cwd: '/repo/worktree-9',
    });

    const mountedSessionIdsAfterSwitch = getMountedSessionIds();
    expect(mountedSessionIdsAfterSwitch).toHaveLength(mountedSessionIdsBeforeSwitch.length);
    expect(new Set(mountedSessionIdsAfterSwitch)).toEqual(new Set(mountedSessionIdsBeforeSwitch));

    await mounted.unmount();
  }, 20000);

  it('requires confirmation before closing a session when the setting is enabled', async () => {
    testState.settings.confirmBeforeClosingAgentSession = true;

    const session = createSession({
      id: 'session-close',
      sessionId: 'provider-close',
      backendSessionId: 'backend-close',
      name: 'Gemini Close',
      terminalTitle: 'Close Target',
    });
    useAgentSessionsStore.setState({
      sessions: [session],
      activeIds: {
        '/repo/worktree': session.id,
      },
      groupStates: {
        '/repo/worktree': {
          groups: [
            {
              id: 'group-close',
              sessionIds: [session.id],
              activeSessionId: session.id,
            },
          ],
          activeGroupId: 'group-close',
          flexPercents: [100],
        },
      },
    });

    const mounted = await mountAgentPanel();

    await clickByTestId(mounted.container, 'close-session-session-close');

    expect(mounted.container.querySelector('[data-testid="close-session-dialog"]')).not.toBeNull();
    expect(testState.electronAPI.abandon).not.toHaveBeenCalled();

    await clickByTestId(mounted.container, 'confirm-close-session');

    expect(testState.electronAPI.sessionKill).toHaveBeenCalledWith('backend-close');
    expect(testState.electronAPI.abandon).toHaveBeenCalledWith('session-close');
    expect(useAgentSessionsStore.getState().sessions).toEqual([]);
    expect(useAgentSessionsStore.getState().getGroupState('/repo/worktree')).toEqual({
      groups: [],
      activeGroupId: null,
      flexPercents: [],
    });
    expect(
      mounted.container.querySelector('[data-testid="agent-panel-empty-state"]')
    ).not.toBeNull();

    await mounted.unmount();
  });

  it('closes an active session immediately and rebinds the group to the remaining session', async () => {
    const firstSession = createSession({
      id: 'session-close-a',
      sessionId: 'provider-close-a',
      backendSessionId: 'backend-close-a',
      name: 'Gemini Close A',
    });
    const secondSession = createSession({
      id: 'session-close-b',
      sessionId: 'provider-close-b',
      backendSessionId: 'backend-close-b',
      name: 'Gemini Close B',
    });
    useAgentSessionsStore.setState({
      sessions: [firstSession, secondSession],
      activeIds: {
        '/repo/worktree': firstSession.id,
      },
      groupStates: {
        '/repo/worktree': {
          groups: [
            {
              id: 'group-close-immediate',
              sessionIds: [firstSession.id, secondSession.id],
              activeSessionId: firstSession.id,
            },
          ],
          activeGroupId: 'group-close-immediate',
          flexPercents: [100],
        },
      },
    });

    const mounted = await mountAgentPanel();

    await clickByTestId(mounted.container, 'close-session-session-close-a');

    const store = useAgentSessionsStore.getState();
    expect(mounted.container.querySelector('[data-testid="close-session-dialog"]')).toBeNull();
    expect(testState.electronAPI.sessionKill).toHaveBeenCalledWith('backend-close-a');
    expect(testState.electronAPI.abandon).toHaveBeenCalledWith('session-close-a');
    expect(store.sessions).toEqual([expect.objectContaining({ id: 'session-close-b' })]);
    expect(store.activeIds['/repo/worktree']).toBeNull();
    expect(store.getGroupState('/repo/worktree')).toEqual({
      groups: [
        expect.objectContaining({
          sessionIds: ['session-close-b'],
          activeSessionId: 'session-close-b',
        }),
      ],
      activeGroupId: 'group-close-immediate',
      flexPercents: [100],
    });
    expect(
      mounted.container
        .querySelector('[data-testid="enhanced-input"]')
        ?.getAttribute('data-session-id')
    ).toBe('session-close-b');
    expect(
      mounted.container
        .querySelector('[data-testid="status-line"]')
        ?.getAttribute('data-session-id')
    ).toBe('session-close-b');

    await mounted.unmount();
  });

  it('clears the pending close dialog when the target session disappears externally', async () => {
    testState.settings.confirmBeforeClosingAgentSession = true;

    const session = createSession({
      id: 'session-disappear',
      sessionId: 'provider-disappear',
      backendSessionId: 'backend-disappear',
      name: 'Gemini Disappear',
    });
    useAgentSessionsStore.setState({
      sessions: [session],
      activeIds: {
        '/repo/worktree': session.id,
      },
      groupStates: {
        '/repo/worktree': {
          groups: [
            {
              id: 'group-disappear',
              sessionIds: [session.id],
              activeSessionId: session.id,
            },
          ],
          activeGroupId: 'group-disappear',
          flexPercents: [100],
        },
      },
    });

    const mounted = await mountAgentPanel();

    await clickByTestId(mounted.container, 'close-session-session-disappear');

    expect(mounted.container.querySelector('[data-testid="close-session-dialog"]')).not.toBeNull();

    await act(async () => {
      useAgentSessionsStore.setState({
        sessions: [],
        activeIds: {
          '/repo/worktree': null,
        },
        groupStates: {
          '/repo/worktree': {
            groups: [],
            activeGroupId: null,
            flexPercents: [],
          },
        },
      });
      await flushMicrotasks();
    });
    await mounted.rerender();

    expect(mounted.container.querySelector('[data-testid="close-session-dialog"]')).toBeNull();
    expect(testState.electronAPI.sessionKill).not.toHaveBeenCalled();
    expect(testState.electronAPI.abandon).not.toHaveBeenCalled();

    await mounted.unmount();
  });

  it('tracks quick terminal session mappings and cleans them up when the feature is disabled', async () => {
    testState.settings.quickTerminal = {
      enabled: true,
      isOpen: true,
    };

    const mounted = await mountAgentPanel();

    expect(
      mounted.container
        .querySelector('[data-testid="quick-terminal-modal"]')
        ?.getAttribute('data-open')
    ).toBe('true');

    await clickByTestId(mounted.container, 'init-quick-terminal-session');

    expect(useTerminalStore.getState().getQuickTerminalSession('/repo/worktree')).toBe(
      'quick-session-1'
    );

    testState.settings.quickTerminal.enabled = false;
    await mounted.rerender();

    expect(testState.electronAPI.sessionKill).toHaveBeenCalledWith('quick-session-1');
    expect(useTerminalStore.getState().getQuickTerminalSession('/repo/worktree')).toBeUndefined();
    expect(testState.settings.setQuickTerminalOpen).toHaveBeenCalledWith(false);

    await mounted.unmount();
  });

  it('gates quick terminal visibility by panel activity state', async () => {
    testState.settings.quickTerminal = {
      enabled: true,
      isOpen: true,
    };

    const mounted = await mountAgentPanel({
      isActive: false,
    });

    expect(
      mounted.container
        .querySelector('[data-testid="quick-terminal-modal"]')
        ?.getAttribute('data-open')
    ).toBe('false');

    await mounted.rerender({
      isActive: true,
    });

    expect(
      mounted.container
        .querySelector('[data-testid="quick-terminal-modal"]')
        ?.getAttribute('data-open')
    ).toBe('true');

    await mounted.rerender({
      isActive: false,
    });

    expect(
      mounted.container
        .querySelector('[data-testid="quick-terminal-modal"]')
        ?.getAttribute('data-open')
    ).toBe('false');

    await mounted.unmount();
  });

  it('kills and clears the quick terminal session when the modal closes', async () => {
    testState.settings.quickTerminal = {
      enabled: true,
      isOpen: true,
    };
    useTerminalStore.getState().setQuickTerminalSession('/repo/worktree', 'quick-session-close');

    const mounted = await mountAgentPanel();

    await clickByTestId(mounted.container, 'close-quick-terminal');

    expect(testState.electronAPI.sessionKill).toHaveBeenCalledWith('quick-session-close');
    expect(useTerminalStore.getState().getQuickTerminalSession('/repo/worktree')).toBeUndefined();
    expect(testState.settings.setQuickTerminalOpen).toHaveBeenCalledWith(false);

    await mounted.unmount();
  });

  it('updates quick terminal open state when the modal requests closing', async () => {
    testState.settings.quickTerminal = {
      enabled: true,
      isOpen: true,
    };

    const mounted = await mountAgentPanel();

    await clickByTestId(mounted.container, 'set-quick-terminal-open-false');

    expect(testState.settings.setQuickTerminalOpen).toHaveBeenCalledWith(false);

    await mounted.unmount();
  });
});
