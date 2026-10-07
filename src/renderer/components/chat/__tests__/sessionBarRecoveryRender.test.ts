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
  agentIntegration: {
    providers: [],
    showProviderSwitcher: false,
    enableProviderDisableFeature: false,
  },
  setAgentProviderEnabled: vi.fn(),
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
  TooltipPopup: ({ children, className }: { children: React.ReactNode; className?: string }) =>
    React.createElement('div', { className, 'data-testid': 'tooltip-popup' }, children),
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
      })
    ));

    const tab = container.querySelector('[role="tab"]');
    expect(tab?.textContent).toContain('Investigate session recovery title');
    expect(tab?.getAttribute('aria-label')).toBe('Investigate session recovery title');
  });

  it('keeps the complete recovered title in a wrapping tooltip', async () => {
    const title = 'Investigate the complete recovered session title '.repeat(8).trim();
    ({ container, root } = await renderSessionBar(
      createRecoveredSession({
        name: title,
        titleSource: 'provider-transcript',
      })
    ));

    const tooltip = container.querySelector<HTMLElement>('[data-testid="tooltip-popup"]');
    expect(tooltip?.textContent).toBe(title);
    expect(tooltip?.className).toContain('max-w-sm');
    expect(tooltip?.className).toContain('whitespace-normal');
    expect(tooltip?.className).toContain('break-words');
  });

  it('shows the active Hapi Codex SQLite limitation as persistent readable feedback', async () => {
    ({ container, root } = await renderSessionBar(
      createRecoveredSession({
        environment: 'hapi',
        agentCapabilityProvider: 'codex',
        agentCapabilityWarnings: [
          'Codex SQLite index isolation is unavailable for Hapi/Happy wrapper launches. Use the native Codex environment for worktree-scoped resume history.',
        ],
      })
    ));

    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Codex resume history is not isolated for Hapi/Happy sessions'
    );
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Use the native Codex environment'
    );
  });

  it.each([
    false,
    true,
  ])('shows the wrapper limitation without capability metadata and without duplicates (previous warning: %s)', async (previousWarning) => {
    ({ container, root } = await renderSessionBar(
      createRecoveredSession({
        environment: 'happy',
        ...(previousWarning
          ? {
              agentCapabilityWarnings: [
                'Codex SQLite index isolation is unavailable for Hapi/Happy wrapper launches. Use the native Codex environment for worktree-scoped resume history.',
              ],
            }
          : {}),
        agentRuntimeWarnings: [
          'Codex SQLite index isolation is unavailable for Hapi/Happy wrapper launches. Use the native Codex environment for worktree-scoped resume history.',
        ],
      })
    ));

    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Codex resume history is not isolated'
    );
  });

  it('shows a separate persistent capability warning when Hapi/Happy cannot apply configured MCP and skills', async () => {
    const sqliteWarning =
      'Codex SQLite index isolation is unavailable for Hapi/Happy wrapper launches. Use the native Codex environment for worktree-scoped resume history.';
    const capabilityWarning =
      'Codex MCP and skill settings were not applied for Hapi/Happy wrapper launches. Use native Codex to apply the configured capabilities.';
    ({ container, root } = await renderSessionBar(
      createRecoveredSession({
        environment: 'hapi',
        agentCapabilityWarnings: [sqliteWarning, capabilityWarning],
        agentRuntimeWarnings: [sqliteWarning, capabilityWarning],
      })
    ));

    const notices = [...container.querySelectorAll('[role="status"]')].map(
      (notice) => notice.textContent
    );
    expect(notices).toHaveLength(2);
    expect(notices).toContainEqual(expect.stringContaining('Codex resume history is not isolated'));
    expect(notices).toContainEqual(
      expect.stringContaining('Codex MCP and skill settings were not applied')
    );
    expect(notices).toContainEqual(expect.stringContaining('Use the native Codex environment'));
  });

  it('does not claim configured MCP and skill settings were skipped without a capability warning', async () => {
    ({ container, root } = await renderSessionBar(
      createRecoveredSession({
        environment: 'happy',
        agentRuntimeWarnings: [
          'Codex SQLite index isolation is unavailable for Hapi/Happy wrapper launches.',
        ],
      })
    ));

    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(container.textContent).not.toContain('Codex MCP and skill settings were not applied');
  });

  it('shows a restart notice when Codex MCP changes were not applied to an existing tmux session', async () => {
    ({ container, root } = await renderSessionBar(
      createRecoveredSession({
        environment: 'native',
        agentCapabilityProvider: 'codex',
        agentCapabilityWarnings: [
          'Codex capability configuration was not applied to an existing tmux session. Restart this Codex session to apply MCP and skill changes.',
        ],
      })
    ));

    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Restart this Codex session'
    );
    expect(container.querySelector('[role="status"]')?.textContent).toContain('MCP and skill');
  });

  it('does not show a wrapper warning on native Codex sessions', async () => {
    ({ container, root } = await renderSessionBar(
      createRecoveredSession({
        environment: 'native',
        agentCapabilityProvider: 'codex',
        agentCapabilityWarnings: [
          'Codex SQLite index isolation is unavailable for Hapi/Happy wrapper launches. Use the native Codex environment for worktree-scoped resume history.',
        ],
      })
    ));

    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('signals the wrapper limitation when the active session bar is collapsed', async () => {
    localStorage.setItem(
      'enso-session-bar',
      JSON.stringify({ x: 50, y: 16, collapsed: true, edge: null })
    );
    ({ container, root } = await renderSessionBar(
      createRecoveredSession({
        environment: 'happy',
        agentCapabilityProvider: 'codex',
        agentCapabilityWarnings: [
          'Codex SQLite index isolation is unavailable for Hapi/Happy wrapper launches. Use the native Codex environment for worktree-scoped resume history.',
        ],
      })
    ));

    expect(container.querySelector('button[aria-label]')?.getAttribute('aria-label')).toContain(
      'Codex resume history is not isolated'
    );
  });

  it('exposes both wrapper limitations in the collapsed button label and title', async () => {
    localStorage.setItem(
      'enso-session-bar',
      JSON.stringify({ x: 50, y: 16, collapsed: true, edge: null })
    );
    ({ container, root } = await renderSessionBar(
      createRecoveredSession({
        environment: 'happy',
        agentCapabilityWarnings: [
          'Codex MCP and skill settings were not applied for Hapi/Happy wrapper launches.',
        ],
        agentRuntimeWarnings: [
          'Codex SQLite index isolation is unavailable for Hapi/Happy wrapper launches.',
        ],
      })
    ));

    const collapsedButton = container.querySelector('button[aria-label]');
    expect(collapsedButton?.getAttribute('aria-label')).toContain(
      'Codex resume history is not isolated'
    );
    expect(collapsedButton?.getAttribute('aria-label')).toContain(
      'Codex MCP and skill settings were not applied'
    );
    expect(collapsedButton?.getAttribute('title')).toContain(
      'Codex resume history is not isolated'
    );
    expect(collapsedButton?.getAttribute('title')).toContain(
      'Codex MCP and skill settings were not applied'
    );
  });
});
