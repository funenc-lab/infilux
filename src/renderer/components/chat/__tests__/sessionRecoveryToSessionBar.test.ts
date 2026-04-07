/* @vitest-environment jsdom */

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

async function loadRecoveryRenderModules() {
  vi.resetModules();
  const localStorageMock = createLocalStorageMock();
  vi.stubGlobal('localStorage', localStorageMock);
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });

  const [{ SessionBar }, { useAgentSessionsStore }, recoveryModule] = await Promise.all([
    import('../SessionBar'),
    import('@/stores/agentSessions'),
    import('../agentSessionRecovery'),
  ]);

  return {
    SessionBar,
    useAgentSessionsStore,
    restoreWorktreeAgentSessions: recoveryModule.restoreWorktreeAgentSessions,
    resetRecoveryCache: recoveryModule.resetWorktreeAgentSessionRecoveryCacheForTests,
    localStorageMock,
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

describe('worktree recovery to SessionBar', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    if (root && container) {
      const mountedRoot = root;
      await act(async () => {
        mountedRoot.unmount();
      });
      container.remove();
    }

    root = null;
    container = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function recoverAndRender(displayName: string) {
    const { SessionBar, useAgentSessionsStore, restoreWorktreeAgentSessions, resetRecoveryCache } =
      await loadRecoveryRenderModules();

    resetRecoveryCache();

    await restoreWorktreeAgentSessions({
      repoPath: '/repo',
      cwd: '/repo/worktree',
      restoreWorktreeSessions: vi.fn().mockResolvedValue(createRestoreResult(displayName)),
      upsertRecoveredSession: useAgentSessionsStore.getState().upsertRecoveredSession,
      updateGroupState: useAgentSessionsStore.getState().updateGroupState,
    });

    const sessions = useAgentSessionsStore.getState().getSessions('/repo', '/repo/worktree');
    const activeSessionId = sessions[0]?.id ?? null;

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
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
      tab: container.querySelector('[role="tab"]'),
      sessions,
    };
  }

  it('renders the default agent label after worktree recovery when stored title metadata is placeholder-only', async () => {
    const { tab, sessions } = await recoverAndRender('›');

    expect(sessions).toEqual([
      expect.objectContaining({
        id: 'session-1',
        name: 'Codex',
      }),
    ]);
    expect(tab?.textContent).toContain('Codex');
    expect(tab?.getAttribute('aria-label')).toBe('Codex');
  });

  it('renders the recovered session name after worktree recovery when the stored title is meaningful', async () => {
    const { tab, sessions } = await recoverAndRender('Investigate session recovery title');

    expect(sessions).toEqual([
      expect.objectContaining({
        id: 'session-1',
        name: 'Investigate session recovery title',
      }),
    ]);
    expect(tab?.textContent).toContain('Investigate session recovery title');
    expect(tab?.getAttribute('aria-label')).toBe('Investigate session recovery title');
  });
});
