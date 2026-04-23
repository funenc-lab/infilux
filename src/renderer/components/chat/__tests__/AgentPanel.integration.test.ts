/* @vitest-environment jsdom */

import type { PersistentAgentSessionRecord } from '@shared/types';
import type { Session } from '../SessionBar';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { useAgentStatusStore } from '@/stores/agentStatus';
import { useCodeReviewContinueStore } from '@/stores/codeReviewContinue';
import { useEditorStore } from '@/stores/editor';
import { useTerminalStore } from '@/stores/terminal';
import { resetWorktreeAgentSessionRecoveryCacheForTests } from '../agentSessionRecovery';

type AgentPanelModule = typeof import('../AgentPanel');
type AgentPanelProps = React.ComponentProps<AgentPanelModule['AgentPanel']>;

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
    claudeCodeIntegration: {
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
    setClaudeCodeIntegration: vi.fn((updates: Record<string, unknown>) => {
      Object.assign(testState.settings.claudeCodeIntegration, updates);
    }),
    setQuickTerminalOpen: vi.fn((open: boolean) => {
      testState.settings.quickTerminal.isOpen = open;
    }),
  },
  electronAPI: {
    restoreWorktreeSessions: vi.fn(async () => ({ items: [] })),
    markPersistent: vi.fn(async () => undefined),
    abandon: vi.fn(async () => undefined),
    sessionKill: vi.fn(async () => undefined),
  },
}));

vi.mock('@/stores/settings', () => ({
  BUILTIN_AGENT_IDS: ['claude', 'codex', 'gemini', 'cursor'],
  useSettingsStore: (selector: (state: typeof testState.settings) => unknown) =>
    selector(testState.settings),
}));

vi.mock('@/stores/worktreeActivity', () => ({
  useWorktreeActivityStore: (
    selector?: (state: typeof testState.worktreeActivity) => unknown
  ) => (selector ? selector(testState.worktreeActivity) : testState.worktreeActivity),
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
  probeRemoteAgentAvailability: vi.fn(async () => true),
  resolvePersistedInstalledAgents: () => new Set(testState.installedAgents),
  resolveRemoteInstalledAgents: vi.fn(async () => new Set(testState.installedAgents)),
}));

vi.mock('../useAgentCanvasViewportRestore', () => ({
  useAgentCanvasViewportRestore: () => undefined,
}));

vi.mock('../AgentTerminal', () => ({
  AgentTerminal: (props: { id?: string }) =>
    React.createElement('div', {
      'data-testid': 'agent-terminal',
      'data-session-id': props.id ?? '',
    }),
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

async function clickByTestId(container: HTMLElement, testId: string) {
  const target = container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  expect(target).not.toBeNull();

  await act(async () => {
    target?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushMicrotasks();
  });
}

async function mountAgentPanel(
  overrides: Partial<AgentPanelProps> = {}
): Promise<MountedAgentPanel> {
  const { AgentPanel } = await import('../AgentPanel');
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
      await flushMicrotasks();
    });
  };

  await render();

  return {
    container,
    rerender: render,
    unmount: async () => {
      await act(async () => {
        root.unmount();
        await flushMicrotasks();
      });
      container.remove();
    },
  };
}

describe('AgentPanel integration', () => {
  beforeEach(() => {
    localStorage.clear();
    resetWorktreeAgentSessionRecoveryCacheForTests();
    resetAgentSessionsStore();
    resetTerminalStore();
    resetEditorStore();
    resetAgentStatusStore();
    resetCodeReviewContinueStore();

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
    testState.settings.claudeCodeIntegration = {
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
    testState.settings.setClaudeCodeIntegration.mockClear();
    testState.settings.setQuickTerminalOpen.mockClear();

    testState.electronAPI.restoreWorktreeSessions.mockReset();
    testState.electronAPI.restoreWorktreeSessions.mockResolvedValue({ items: [] });
    testState.electronAPI.markPersistent.mockReset();
    testState.electronAPI.markPersistent.mockResolvedValue(undefined);
    testState.electronAPI.abandon.mockReset();
    testState.electronAPI.abandon.mockResolvedValue(undefined);
    testState.electronAPI.sessionKill.mockReset();
    testState.electronAPI.sessionKill.mockResolvedValue(undefined);

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
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
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
  });

  it('creates a default session from the empty state and attaches it to the first group', async () => {
    const mounted = await mountAgentPanel();

    expect(
      mounted.container.querySelector('[data-testid="agent-panel-empty-state"]')
    ).not.toBeNull();
    expect(
      mounted.container.querySelector('[data-testid="agent-panel-empty-state"]')?.getAttribute(
        'data-enabled-agent-count'
      )
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
      mounted.container.querySelector('[data-testid="enhanced-input"]')?.getAttribute(
        'data-session-id'
      )
    ).toBe('session-a');
    expect(
      mounted.container.querySelector('[data-testid="status-line"]')?.getAttribute('data-session-id')
    ).toBe('session-a');

    await clickByTestId(mounted.container, 'select-session-session-b');

    const store = useAgentSessionsStore.getState();
    expect(store.activeIds['/repo/worktree']).toBe('session-b');
    expect(store.getGroupState('/repo/worktree').groups[0]?.activeSessionId).toBe('session-b');
    expect(
      mounted.container.querySelector('[data-testid="enhanced-input"]')?.getAttribute(
        'data-session-id'
      )
    ).toBe('session-b');
    expect(
      mounted.container.querySelector('[data-testid="status-line"]')?.getAttribute('data-session-id')
    ).toBe('session-b');

    await mounted.unmount();
  });

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

    expect(
      mounted.container.querySelector('[data-testid="close-session-dialog"]')
    ).not.toBeNull();
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
    expect(
      mounted.container.querySelector('[data-testid="close-session-dialog"]')
    ).toBeNull();
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
      mounted.container.querySelector('[data-testid="enhanced-input"]')?.getAttribute(
        'data-session-id'
      )
    ).toBe('session-close-b');
    expect(
      mounted.container.querySelector('[data-testid="status-line"]')?.getAttribute('data-session-id')
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

    expect(
      mounted.container.querySelector('[data-testid="close-session-dialog"]')
    ).not.toBeNull();

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

    expect(
      mounted.container.querySelector('[data-testid="close-session-dialog"]')
    ).toBeNull();
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
      mounted.container.querySelector('[data-testid="quick-terminal-modal"]')?.getAttribute(
        'data-open'
      )
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
      mounted.container.querySelector('[data-testid="quick-terminal-modal"]')?.getAttribute(
        'data-open'
      )
    ).toBe('false');

    await mounted.rerender({
      isActive: true,
    });

    expect(
      mounted.container.querySelector('[data-testid="quick-terminal-modal"]')?.getAttribute(
        'data-open'
      )
    ).toBe('true');

    await mounted.rerender({
      isActive: false,
    });

    expect(
      mounted.container.querySelector('[data-testid="quick-terminal-modal"]')?.getAttribute(
        'data-open'
      )
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
