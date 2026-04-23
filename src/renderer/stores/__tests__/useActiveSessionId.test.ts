/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function createLocalStorageMock() {
  const data = new Map<string, string>();
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

async function loadAgentSessionsModule() {
  vi.resetModules();
  vi.stubGlobal('localStorage', createLocalStorageMock());
  return await import('../agentSessions');
}

function makeSession(
  overrides: Record<string, unknown> = {}
): {
  id: string;
  sessionId: string;
  name: string;
  agentId: string;
  agentCommand: string;
  initialized: boolean;
  activated: boolean;
  repoPath: string;
  cwd: string;
  environment: 'native';
  persistenceEnabled: boolean;
} {
  return {
    id: 'session-1',
    sessionId: 'provider-1',
    name: 'Claude',
    agentId: 'claude',
    agentCommand: 'claude',
    initialized: true,
    activated: true,
    repoPath: '/repo',
    cwd: '/repo/worktree-a',
    environment: 'native',
    persistenceEnabled: false,
    ...overrides,
  };
}

describe('useActiveSessionId', () => {
  let latestSessionId: string | null = null;

  beforeEach(() => {
    latestSessionId = null;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns null when the worktree path is missing', async () => {
    const { useActiveSessionId } = await loadAgentSessionsModule();

    function Harness() {
      latestSessionId = useActiveSessionId(null);
      return React.createElement('div');
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    act(() => {
      root.render(React.createElement(Harness));
    });

    expect(latestSessionId).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it('returns the configured active session id when it still exists in the worktree', async () => {
    const { useActiveSessionId, useAgentSessionsStore } = await loadAgentSessionsModule();

    useAgentSessionsStore.setState({
      sessions: [
        makeSession({
          id: 'session-1',
          cwd: '/repo/worktree-a/',
        }),
        makeSession({
          id: 'session-2',
          sessionId: 'provider-2',
          cwd: '/repo/worktree-a',
        }),
      ],
      activeIds: {
        '/repo/worktree-a': 'session-2',
      },
    });

    function Harness() {
      latestSessionId = useActiveSessionId('/repo/worktree-a');
      return React.createElement('div');
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    act(() => {
      root.render(React.createElement(Harness));
    });

    expect(latestSessionId).toBe('session-2');

    act(() => {
      root.unmount();
    });
  });

  it('falls back to the first session in the worktree when the active session is stale or missing', async () => {
    const { useActiveSessionId, useAgentSessionsStore } = await loadAgentSessionsModule();

    useAgentSessionsStore.setState({
      sessions: [
        makeSession({
          id: 'session-1',
          cwd: '/repo/worktree-a/',
        }),
        makeSession({
          id: 'session-2',
          sessionId: 'provider-2',
          cwd: '/repo/worktree-b',
        }),
      ],
      activeIds: {
        '/repo/worktree-a': 'stale-session',
      },
    });

    function Harness() {
      latestSessionId = useActiveSessionId('/repo/worktree-a');
      return React.createElement('div');
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    act(() => {
      root.render(React.createElement(Harness));
    });

    expect(latestSessionId).toBe('session-1');

    act(() => {
      root.unmount();
    });
  });

  it('returns null when the worktree has no matching sessions after fallback resolution', async () => {
    const { useActiveSessionId, useAgentSessionsStore } = await loadAgentSessionsModule();

    useAgentSessionsStore.setState({
      sessions: [],
      activeIds: {
        '/repo/worktree-a': 'stale-session',
      },
    });

    function Harness() {
      latestSessionId = useActiveSessionId('/repo/worktree-a');
      return React.createElement('div');
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    act(() => {
      root.render(React.createElement(Harness));
    });

    expect(latestSessionId).toBeNull();

    act(() => {
      root.unmount();
    });
  });
});
