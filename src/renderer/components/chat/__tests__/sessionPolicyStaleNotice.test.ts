/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../SessionBar';

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

vi.mock('@/stores/agentSessions', () => ({
  useAgentSessionsStore: (selector: (state: { clearTaskCompletedUnread: () => void }) => unknown) =>
    selector({
      clearTaskCompletedUnread: vi.fn(),
    }),
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
    React.createElement('div', null, children),
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
  ActivityIndicator: () => React.createElement('span'),
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

function createSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    sessionId: 'provider-1',
    backendSessionId: 'backend-1',
    name: 'Claude',
    agentId: 'claude',
    agentCommand: 'claude',
    initialized: true,
    activated: true,
    repoPath: '/repo',
    cwd: '/repo/worktrees/feat-a',
    environment: 'native',
    claudePolicyHash: 'hash-1',
    claudePolicyStale: true,
    ...overrides,
  };
}

describe('SessionBar policy stale notice', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
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
    vi.unstubAllGlobals();
  });

  it('renders a restart notice when the active Claude session is stale', async () => {
    const { SessionBar } = await import('../SessionBar');
    const session = createSession();

    await act(async () => {
      root?.render(
        React.createElement(SessionBar, {
          sessions: [session],
          activeSessionId: session.id,
          repoPath: session.repoPath,
          onSelectSession: vi.fn(),
          onCloseSession: vi.fn(),
          onNewSession: vi.fn(),
          onRenameSession: vi.fn(),
        })
      );
    });

    expect(container?.textContent).toContain(
      'Skill and MCP settings changed. Restart sessions to apply.'
    );
  });
});
