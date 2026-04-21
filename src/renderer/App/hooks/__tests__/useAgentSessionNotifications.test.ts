import type { AgentStopNotificationData } from '@shared/types/agent';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@/components/chat/SessionBar';

const notificationListeners: {
  askUserQuestion?: (payload: { sessionId: string; toolInput: unknown; cwd?: string }) => void;
  click?: (sessionId: string) => void;
  preToolUse?: (payload: { sessionId: string; toolName: string; cwd?: string }) => void;
  stop?: (payload: AgentStopNotificationData) => void;
} = {};

const showRendererNotification = vi.fn(() => Promise.resolve());
const focusSession = vi.fn();
const setWaitingForInput = vi.fn();
const setOutputState = vi.fn();
const markTaskCompletedUnread = vi.fn();
const setEnhancedInputOpen = vi.fn();
const getActivityState = vi.fn(() => 'idle');
const requestCanvasFocus = vi.fn();
const switchWorktreePath = vi.fn();

let sessions: Session[] = [];
let activeIds: Record<string, string | null> = {};
let groupStates: Record<
  string,
  {
    activeGroupId: string | null;
    flexPercents: number[];
    groups: Array<{ id: string; sessionIds: string[]; activeSessionId: string | null }>;
  }
> = {};
let claudeCodeIntegration = {
  enhancedInputAutoPopup: 'always' as const,
  enhancedInputEnabled: true,
  stopHookEnabled: true,
};
let nativeTerminalAgentIds = new Set<string>();

const agentSessionsStoreState = {
  get activeIds() {
    return activeIds;
  },
  focusSession,
  get groupStates() {
    return groupStates;
  },
  markTaskCompletedUnread,
  get sessions() {
    return sessions;
  },
  setEnhancedInputOpen,
  setOutputState,
  setWaitingForInput,
};

const useAgentSessionsStore = {
  getState: () => agentSessionsStoreState,
};

const useSettingsStore = {
  getState: () => ({
    claudeCodeIntegration,
  }),
};

const useWorktreeActivityStore = {
  getState: () => ({
    getActivityState,
  }),
};

vi.mock('react', () => ({
  useEffect: (effect: () => undefined | (() => void)) => {
    effect();
  },
  useRef: <T>(value: T) => ({ current: value }),
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string, params?: Record<string, string | number>) =>
      value.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(params?.[key] ?? '')),
  }),
}));

vi.mock('@/components/chat/agentInputMode', () => ({
  supportsAgentNativeTerminalInput: (agentId: string) => nativeTerminalAgentIds.has(agentId),
}));

vi.mock('@/lib/electronNotification', () => ({
  onAgentStopNotification: (callback: (payload: AgentStopNotificationData) => void) => {
    notificationListeners.stop = callback;
    return vi.fn();
  },
  onAskUserQuestionNotification: (
    callback: (payload: { sessionId: string; toolInput: unknown; cwd?: string }) => void
  ) => {
    notificationListeners.askUserQuestion = callback;
    return vi.fn();
  },
  onNotificationClick: (callback: (sessionId: string) => void) => {
    notificationListeners.click = callback;
    return vi.fn();
  },
  onPreToolUseNotification: (
    callback: (payload: { sessionId: string; toolName: string; cwd?: string }) => void
  ) => {
    notificationListeners.preToolUse = callback;
    return vi.fn();
  },
  showRendererNotification,
}));

vi.mock('@/stores/agentSessions', () => ({
  useAgentSessionsStore,
}));

vi.mock('@/stores/settings', () => ({
  useSettingsStore,
}));

vi.mock('@/stores/worktreeActivity', () => ({
  useWorktreeActivityStore,
}));

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    sessionId: 'provider-1',
    name: 'Claude',
    agentId: 'claude',
    agentCommand: 'claude',
    initialized: true,
    activated: true,
    repoPath: '/repo',
    cwd: '/repo/worktree',
    environment: 'native',
    ...overrides,
  };
}

async function registerHook(
  overrides: Partial<{
    activeTab: 'chat' | 'file' | 'terminal' | 'source-control' | 'settings' | 'todo';
    activeWorktreePath: string | null;
    hasSelectedSubagent: boolean;
  }> = {}
) {
  const { useAgentSessionNotifications } = await import('../useAgentSessionNotifications');

  useAgentSessionNotifications({
    activeTab: overrides.activeTab ?? 'chat',
    activeWorktreePath: overrides.activeWorktreePath ?? '/repo/other-worktree',
    hasSelectedSubagent: overrides.hasSelectedSubagent ?? false,
    onRequestCanvasFocus: requestCanvasFocus,
    onSwitchWorktreePath: switchWorktreePath,
  });
}

describe('useAgentSessionNotifications', () => {
  beforeEach(() => {
    sessions = [];
    activeIds = {};
    groupStates = {};
    nativeTerminalAgentIds = new Set<string>();
    claudeCodeIntegration = {
      enhancedInputAutoPopup: 'always',
      enhancedInputEnabled: true,
      stopHookEnabled: true,
    };
    notificationListeners.askUserQuestion = undefined;
    notificationListeners.click = undefined;
    notificationListeners.preToolUse = undefined;
    notificationListeners.stop = undefined;
    focusSession.mockReset();
    setWaitingForInput.mockReset();
    setOutputState.mockReset();
    markTaskCompletedUnread.mockReset();
    setEnhancedInputOpen.mockReset();
    getActivityState.mockReset();
    getActivityState.mockReturnValue('idle');
    requestCanvasFocus.mockReset();
    switchWorktreePath.mockReset();
    showRendererNotification.mockReset();
    showRendererNotification.mockResolvedValue(undefined);
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('focuses the clicked session, requests canvas focus, and switches worktrees when needed', async () => {
    sessions = [
      makeSession({
        id: 'session-2',
        sessionId: 'provider-2',
        agentId: 'codex',
        agentCommand: 'codex',
        cwd: '/repo/worktree-b',
      }),
    ];

    await registerHook({
      activeTab: 'chat',
      activeWorktreePath: '/repo/worktree-a',
      hasSelectedSubagent: false,
    });

    notificationListeners.click?.('provider-2');

    expect(focusSession).toHaveBeenCalledWith('session-2');
    expect(requestCanvasFocus).toHaveBeenCalledWith('/repo/worktree-b', 'session-2');
    expect(switchWorktreePath).toHaveBeenCalledWith('/repo/worktree-b');
  });

  it('skips canvas focus requests when the chat panel is not the active transcript view', async () => {
    sessions = [
      makeSession({
        id: 'session-2',
        sessionId: 'provider-2',
        agentId: 'codex',
        agentCommand: 'codex',
        cwd: '/repo/worktree-b',
      }),
    ];

    await registerHook({
      activeTab: 'terminal',
      activeWorktreePath: '/repo/worktree-a',
      hasSelectedSubagent: false,
    });

    notificationListeners.click?.('provider-2');

    expect(focusSession).toHaveBeenCalledWith('session-2');
    expect(requestCanvasFocus).not.toHaveBeenCalled();
    expect(switchWorktreePath).toHaveBeenCalledWith('/repo/worktree-b');
  });

  it('marks completed runs unread, clears waiting state, and auto-opens enhanced input when configured', async () => {
    sessions = [
      makeSession({
        id: 'session-1',
        sessionId: 'provider-1',
        terminalTitle: 'Feature work',
      }),
    ];

    await registerHook({
      activeTab: 'terminal',
      activeWorktreePath: '/repo/other-worktree',
      hasSelectedSubagent: false,
    });

    notificationListeners.stop?.({
      sessionId: 'provider-1',
      taskCompletionStatus: 'completed',
    });

    expect(setWaitingForInput).toHaveBeenCalledWith('session-1', false);
    expect(setOutputState).toHaveBeenCalledWith('session-1', 'idle', false);
    expect(markTaskCompletedUnread).toHaveBeenCalledWith('session-1');
    expect(setEnhancedInputOpen).toHaveBeenCalledWith('session-1', true);
    expect(showRendererNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
      })
    );
  });

  it('marks sessions as waiting for user input and sends a renderer notification', async () => {
    sessions = [makeSession()];

    await registerHook();

    notificationListeners.askUserQuestion?.({
      sessionId: 'provider-1',
      toolInput: {
        questions: [{ question: 'Confirm deployment?' }],
      },
    });

    expect(setWaitingForInput).toHaveBeenCalledWith('session-1', true);
    expect(showRendererNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
      })
    );
  });

  it('clears waiting-input state only for user prompt submit tool events', async () => {
    sessions = [makeSession()];

    await registerHook();

    notificationListeners.preToolUse?.({
      sessionId: 'provider-1',
      toolName: 'OtherTool',
      cwd: '/repo/worktree',
    });
    expect(setWaitingForInput).not.toHaveBeenCalled();

    notificationListeners.preToolUse?.({
      sessionId: 'provider-1',
      toolName: 'UserPromptSubmit',
      cwd: '/repo/worktree',
    });

    expect(setWaitingForInput).toHaveBeenCalledWith('session-1', false);
  });
});
