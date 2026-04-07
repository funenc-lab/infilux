/* @vitest-environment jsdom */

import type { GitWorktree } from '@shared/types';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const settingsStoreState = {
  claudeCodeIntegration: {
    providers: [],
    showProviderSwitcher: false,
    enableProviderDisableFeature: false,
  },
  setClaudeProviderEnabled: vi.fn(),
  agentSettings: {},
  agentDetectionStatus: {},
  customAgents: [],
  hapiSettings: {
    enabled: false,
    happyEnabled: false,
  },
};

type UseStartupAgentSessionRecoveryHook =
  typeof import('../useStartupAgentSessionRecovery').useStartupAgentSessionRecovery;

let useStartupAgentSessionRecoveryHook: UseStartupAgentSessionRecoveryHook | null = null;

function createLocalStorageMock(initial?: Record<string, string>) {
  const data = new Map(Object.entries(initial ?? {}));
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      data.delete(key);
    }),
    clear: vi.fn(() => {
      data.clear();
    }),
  };
}

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
  useQuery: () => ({
    data: null,
  }),
  useMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string) => value,
  }),
}));

vi.mock('@/stores/settings', () => ({
  useSettingsStore: (selector?: (state: typeof settingsStoreState) => unknown) =>
    selector ? selector(settingsStoreState) : settingsStoreState,
}));

vi.mock('@/hooks/useOutputState', () => ({
  useSessionOutputState: () => 'idle',
  useSessionTaskCompletionNotice: () => false,
}));

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({
    children,
    render,
  }: {
    children?: React.ReactNode;
    render?: React.ReactElement;
  }) => render ?? children ?? null,
  TooltipPopup: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'tooltip-popup' }, children),
}));

vi.mock('@/components/ui/glow-card', () => ({
  GlowCard: ({
    as = 'div',
    children,
    ...props
  }: {
    as?: 'div' | 'button';
    children: React.ReactNode;
  } & Record<string, unknown>) => React.createElement(as, props, children),
}));

vi.mock('@/components/ui/activity-indicator', () => ({
  ActivityIndicator: () => React.createElement('span', { 'data-testid': 'activity-indicator' }),
}));

vi.mock('@/components/ui/toast', () => ({
  toastManager: {
    add: vi.fn(),
  },
}));

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function makeWorktree(path: string): GitWorktree {
  return {
    path,
    head: 'abc123',
    branch: 'feature',
    isMainWorktree: false,
    isLocked: false,
    prunable: false,
  };
}

function createRestoreResult(displayName: string) {
  return {
    items: [
      {
        recoverable: true as const,
        runtimeState: 'live' as const,
        record: {
          uiSessionId: 'session-1',
          backendSessionId: 'backend-session-1',
          providerSessionId: 'provider-session-1',
          agentId: 'codex',
          agentCommand: 'codex',
          environment: 'native' as const,
          repoPath: '/repo',
          cwd: '/repo/worktree',
          displayName,
          activated: true,
          initialized: true,
          hostKind: 'tmux' as const,
          hostSessionKey: 'enso-session-1',
          recoveryPolicy: 'auto' as const,
          createdAt: 1,
          updatedAt: 2,
          lastKnownState: 'live' as const,
        },
      },
    ],
  };
}

function HookHarness({ activeWorktree }: { activeWorktree: GitWorktree }) {
  if (!useStartupAgentSessionRecoveryHook) {
    throw new Error('Startup recovery hook not loaded');
  }

  useStartupAgentSessionRecoveryHook({
    selectedRepo: '/repo',
    activeWorktree,
    selectedRepoCanLoad: true,
    worktreesFetched: true,
    worktreesFetching: false,
    availableWorktreePaths: ['/repo', activeWorktree.path],
  });

  return React.createElement('div');
}

async function loadStartupRecoveryModules(displayName: string) {
  vi.resetModules();

  const localStorageMock = createLocalStorageMock();
  const restoreWorktreeSessions = vi.fn().mockResolvedValue(createRestoreResult(displayName));

  vi.stubGlobal('localStorage', localStorageMock);
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  Object.defineProperty(window, 'electronAPI', {
    value: {
      agentSession: {
        restoreWorktreeSessions,
      },
    },
    configurable: true,
  });

  const [hookModule, storeModule, sessionBarModule, recoveryModule] = await Promise.all([
    import('../useStartupAgentSessionRecovery'),
    import('@/stores/agentSessions'),
    import('@/components/chat/SessionBar'),
    import('@/components/chat/agentSessionRecovery'),
  ]);

  useStartupAgentSessionRecoveryHook = hookModule.useStartupAgentSessionRecovery;
  recoveryModule.resetWorktreeAgentSessionRecoveryCacheForTests();

  return {
    SessionBar: sessionBarModule.SessionBar,
    useAgentSessionsStore: storeModule.useAgentSessionsStore,
    restoreWorktreeSessions,
  };
}

describe('useStartupAgentSessionRecovery to SessionBar', () => {
  let hookRoot: Root | null = null;
  let hookContainer: HTMLDivElement | null = null;
  let sessionBarRoot: Root | null = null;
  let sessionBarContainer: HTMLDivElement | null = null;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    if (hookRoot) {
      const mountedHookRoot = hookRoot;
      await act(async () => {
        mountedHookRoot.unmount();
      });
    }
    if (hookContainer) {
      hookContainer.remove();
    }
    if (sessionBarRoot) {
      const mountedSessionBarRoot = sessionBarRoot;
      await act(async () => {
        mountedSessionBarRoot.unmount();
      });
    }
    if (sessionBarContainer) {
      sessionBarContainer.remove();
    }

    hookRoot = null;
    hookContainer = null;
    sessionBarRoot = null;
    sessionBarContainer = null;
    useStartupAgentSessionRecoveryHook = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function recoverAtStartupAndRender(displayName: string) {
    const { SessionBar, useAgentSessionsStore, restoreWorktreeSessions } =
      await loadStartupRecoveryModules(displayName);

    hookContainer = document.createElement('div');
    document.body.appendChild(hookContainer);
    hookRoot = createRoot(hookContainer);

    await act(async () => {
      hookRoot?.render(
        React.createElement(HookHarness, { activeWorktree: makeWorktree('/repo/worktree') })
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const sessions = useAgentSessionsStore.getState().getSessions('/repo', '/repo/worktree');
    const activeSessionId = useAgentSessionsStore
      .getState()
      .getActiveSessionId('/repo', '/repo/worktree');

    sessionBarContainer = document.createElement('div');
    document.body.appendChild(sessionBarContainer);
    sessionBarRoot = createRoot(sessionBarContainer);

    await act(async () => {
      sessionBarRoot?.render(
        React.createElement(SessionBar, {
          sessions,
          activeSessionId,
          repoPath: '/repo',
          onSelectSession: vi.fn(),
          onCloseSession: vi.fn(),
          onNewSession: vi.fn(),
          onRenameSession: vi.fn(),
        })
      );
    });

    return {
      restoreWorktreeSessions,
      sessions,
      tab: sessionBarContainer.querySelector('[role="tab"]'),
    };
  }

  it('renders the default agent label after startup prewarm when the recovered title metadata is placeholder-only', async () => {
    const { restoreWorktreeSessions, sessions, tab } = await recoverAtStartupAndRender('›');

    expect(restoreWorktreeSessions).toHaveBeenCalledWith({
      repoPath: '/repo',
      cwd: '/repo/worktree',
    });
    expect(sessions).toEqual([
      expect.objectContaining({
        id: 'session-1',
        name: 'Codex',
      }),
    ]);
    expect(tab?.textContent).toContain('Codex');
    expect(tab?.getAttribute('aria-label')).toBe('Codex');
  });

  it('renders the recovered session name after startup prewarm when the stored title is meaningful', async () => {
    const { restoreWorktreeSessions, sessions, tab } = await recoverAtStartupAndRender(
      'Investigate startup recovery title'
    );

    expect(restoreWorktreeSessions).toHaveBeenCalledWith({
      repoPath: '/repo',
      cwd: '/repo/worktree',
    });
    expect(sessions).toEqual([
      expect.objectContaining({
        id: 'session-1',
        name: 'Investigate startup recovery title',
      }),
    ]);
    expect(tab?.textContent).toContain('Investigate startup recovery title');
    expect(tab?.getAttribute('aria-label')).toBe('Investigate startup recovery title');
  });
});
