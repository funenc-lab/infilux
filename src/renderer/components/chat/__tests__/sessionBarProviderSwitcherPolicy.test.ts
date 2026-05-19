/* @vitest-environment jsdom */

import type { AgentProviderProfile } from '@shared/types';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../SessionBar';
import { supportsAgentProviderProfileSwitcher } from '../sessionBarProviderPolicy';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const providerSwitcherTestState = vi.hoisted(() => {
  const queryCalls: Array<{
    enabled?: boolean;
    queryKey: readonly unknown[];
  }> = [];

  const providers: AgentProviderProfile[] = [
    {
      id: 'claude-provider',
      name: 'Claude Provider',
      providerId: 'claude-code',
      baseUrl: 'https://claude.example.com',
      authToken: 'claude-token',
    },
    {
      id: 'codex-provider',
      name: 'Codex Provider',
      providerId: 'codex-cli',
      baseUrl: 'https://codex.example.com/v1',
      authToken: 'codex-token',
    },
    {
      id: 'gemini-provider',
      name: 'Gemini Provider',
      providerId: 'gemini-cli',
      baseUrl: 'https://generativelanguage.googleapis.com',
      authToken: 'gemini-token',
    },
  ];

  const settings = {
    agentIntegration: {
      providers,
      showProviderSwitcher: true,
      enableProviderDisableFeature: true,
    },
    agentSettings: {},
    agentDetectionStatus: {},
    customAgents: [],
    hapiSettings: {
      enabled: false,
      happyEnabled: false,
    },
    setAgentProviderEnabled: vi.fn(),
  };

  function reset() {
    queryCalls.length = 0;
    settings.agentIntegration.showProviderSwitcher = true;
    settings.setAgentProviderEnabled.mockReset();
  }

  return {
    queryCalls,
    reset,
    settings,
  };
});

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
  useQuery: (options: { enabled?: boolean; queryKey: readonly unknown[] }) => {
    providerSwitcherTestState.queryCalls.push({
      enabled: options.enabled,
      queryKey: options.queryKey,
    });
    return {
      data: {
        extracted: {
          providerId: 'codex-cli',
          baseUrl: 'https://codex.example.com/v1',
          authToken: 'codex-token',
        },
      },
    };
  },
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
  useSettingsStore: (selector?: (state: typeof providerSwitcherTestState.settings) => unknown) =>
    selector ? selector(providerSwitcherTestState.settings) : providerSwitcherTestState.settings,
}));

vi.mock('@/stores/agentSessions', () => ({
  useAgentSessionsStore: (
    selector: (state: { clearTaskCompletedUnread: ReturnType<typeof vi.fn> }) => unknown
  ) =>
    selector({
      clearTaskCompletedUnread: vi.fn(),
    }),
}));

vi.mock('@/hooks/useOutputState', () => ({
  useSessionOutputState: () => 'idle',
  useSessionTaskCompletionNotice: () => false,
}));

vi.mock('@/components/ui/activity-indicator', () => ({
  ActivityIndicator: () => React.createElement('span', { 'data-testid': 'activity-indicator' }),
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

vi.mock('@/components/ui/toast', () => ({
  toastManager: {
    add: vi.fn(),
  },
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

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function createSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    sessionId: 'provider-session-1',
    backendSessionId: 'backend-session-1',
    name: 'Codex',
    agentId: 'codex',
    agentCommand: 'codex',
    initialized: true,
    activated: true,
    repoPath: '/repo',
    cwd: '/repo/worktree',
    environment: 'native',
    ...overrides,
  };
}

async function renderSessionBar(session: Session): Promise<{
  container: HTMLDivElement;
  root: Root;
}> {
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

function setInputValue(input: HTMLInputElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )?.set;
  if (!valueSetter) {
    throw new Error('HTMLInputElement value setter is unavailable');
  }

  valueSetter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function dispatchComposingKeyDown(target: HTMLElement, key: string): void {
  const event = new KeyboardEvent('keydown', { bubbles: true, key });
  Object.defineProperty(event, 'isComposing', {
    configurable: true,
    value: true,
  });
  target.dispatchEvent(event);
}

describe('sessionBarProviderSwitcherPolicy', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    providerSwitcherTestState.reset();
    localStorage.clear();
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
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

  it('delegates provider profile support to the active adapter session policy', () => {
    expect(supportsAgentProviderProfileSwitcher(undefined)).toBe(true);
    expect(
      supportsAgentProviderProfileSwitcher({ agentId: 'claude', agentCommand: 'claude' })
    ).toBe(true);
    expect(
      supportsAgentProviderProfileSwitcher({ agentId: 'claude-hapi', agentCommand: 'claude' })
    ).toBe(true);
    expect(supportsAgentProviderProfileSwitcher({ agentId: 'codex', agentCommand: 'codex' })).toBe(
      true
    );
    expect(
      supportsAgentProviderProfileSwitcher({ agentId: 'gemini', agentCommand: 'gemini' })
    ).toBe(true);
    expect(
      supportsAgentProviderProfileSwitcher({ agentId: 'custom-agent', agentCommand: 'custom' })
    ).toBe(false);
  });

  it('enables SessionBar provider queries and controls for Codex sessions', async () => {
    ({ container, root } = await renderSessionBar(createSession()));

    expect(providerSwitcherTestState.queryCalls.at(-1)).toEqual({
      enabled: true,
      queryKey: ['agent-provider-settings', 'codex-cli', '/repo'],
    });
    expect(container.querySelector('button[aria-label="Codex Provider"]')).not.toBeNull();
  });

  it('keeps session title editing open when Enter confirms an IME composition', async () => {
    const onRenameSession = vi.fn();
    const { SessionBar } = await import('../SessionBar');
    const session = createSession({
      id: 'ime-session',
      name: 'Original Title',
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(SessionBar, {
          sessions: [session],
          activeSessionId: session.id,
          repoPath: session.repoPath,
          onSelectSession: vi.fn(),
          onCloseSession: vi.fn(),
          onNewSession: vi.fn(),
          onRenameSession,
        })
      );
    });

    const tab = container.querySelector<HTMLElement>('[role="tab"]');
    expect(tab).not.toBeNull();

    await act(async () => {
      tab?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    });

    const input = container.querySelector<HTMLInputElement>('input[type="text"]');
    expect(input).not.toBeNull();

    await act(async () => {
      if (input) {
        setInputValue(input, 'Composing Title');
        dispatchComposingKeyDown(input, 'Enter');
      }
    });

    expect(onRenameSession).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLInputElement>('input[type="text"]')).not.toBeNull();
  });

  it('keeps provider queries and controls disabled for unsupported sessions', async () => {
    ({ container, root } = await renderSessionBar(
      createSession({
        agentId: 'custom-agent',
        agentCommand: 'custom',
        name: 'Custom Agent',
      })
    ));

    expect(providerSwitcherTestState.queryCalls.at(-1)).toEqual({
      enabled: false,
      queryKey: ['agent-provider-settings', 'registry', '/repo'],
    });
    expect(container.querySelector('button[aria-label="Select Provider"]')).toBeNull();
  });
});
