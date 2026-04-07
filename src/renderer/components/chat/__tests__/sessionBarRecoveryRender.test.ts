/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../SessionBar';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const clearTaskCompletedUnread = vi.fn();

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
  useAgentSessionsStore: (
    selector: (state: { clearTaskCompletedUnread: typeof clearTaskCompletedUnread }) => unknown
  ) =>
    selector({
      clearTaskCompletedUnread,
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

function createRecoveredSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-recovered',
    sessionId: 'provider-recovered',
    backendSessionId: 'backend-recovered',
    name: 'Codex',
    agentId: 'codex',
    agentCommand: 'codex',
    initialized: true,
    activated: true,
    repoPath: '/repo',
    cwd: '/repo/worktree',
    environment: 'native',
    persistenceEnabled: true,
    recovered: true,
    recoveryState: 'live',
    ...overrides,
  };
}

async function renderSessionBar(session: Session) {
  const { SessionBar } = await import('../SessionBar');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
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

  return { container, root };
}

describe('SessionBar recovery render', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    clearTaskCompletedUnread.mockReset();
    localStorage.clear();
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
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
  });

  it('falls back to the default agent label when recovered title metadata is placeholder-only', async () => {
    ({ container, root } = await renderSessionBar(
      createRecoveredSession({
        name: '›',
        terminalTitle: '›',
      })
    ));

    const tab = container.querySelector('[role="tab"]');
    expect(tab?.textContent).toContain('Codex');
    expect(tab?.getAttribute('aria-label')).toBe('Codex');
  });

  it('preserves a meaningful recovered session name when the terminal title is placeholder-only', async () => {
    ({ container, root } = await renderSessionBar(
      createRecoveredSession({
        name: 'Investigate session recovery title',
        terminalTitle: '›',
      })
    ));

    const tab = container.querySelector('[role="tab"]');
    expect(tab?.textContent).toContain('Investigate session recovery title');
    expect(tab?.getAttribute('aria-label')).toBe('Investigate session recovery title');
  });
});
