/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentProviderSessionDiscovery } from '../useAgentProviderSessionDiscovery';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const resolveProviderSession = vi.fn();
const onProviderSessionIdChange = vi.fn();

function HookHarness({ args }: { args: Parameters<typeof useAgentProviderSessionDiscovery>[0] }) {
  useAgentProviderSessionDiscovery(args);
  return React.createElement('div');
}

function mountHookHarness(args: Parameters<typeof useAgentProviderSessionDiscovery>[0]) {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const root: Root = createRoot(container);
  act(() => {
    root.render(React.createElement(HookHarness, { args }));
  });

  return {
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('useAgentProviderSessionDiscovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resolveProviderSession.mockReset();
    onProviderSessionIdChange.mockReset();
    window.electronAPI = {
      agentSession: {
        resolveProviderSession,
      },
    } as never;
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('polls codex provider session discovery after initialization until a provider session id is found', async () => {
    resolveProviderSession
      .mockResolvedValueOnce({ providerSessionId: null })
      .mockResolvedValueOnce({ providerSessionId: 'codex-session-1' });

    const mounted = mountHookHarness({
      agentCommand: 'codex',
      uiSessionId: 'ui-session-1',
      providerSessionId: 'ui-session-1',
      cwd: '/repo/worktree-a',
      createdAt: 100,
      initialized: true,
      isRemoteExecution: false,
      onProviderSessionIdChange,
      pollIntervalMs: 1000,
      maxAttempts: 3,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(resolveProviderSession).toHaveBeenCalledTimes(1);
    expect(resolveProviderSession).toHaveBeenCalledWith(
      expect.objectContaining({
        agentCommand: 'codex',
        cwd: '/repo/worktree-a',
        createdAt: 100,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      await Promise.resolve();
    });

    expect(resolveProviderSession).toHaveBeenCalledTimes(2);
    expect(onProviderSessionIdChange).toHaveBeenCalledWith('codex-session-1');

    mounted.unmount();
  });

  it('does not start discovery when the provider session id is already distinct from the ui session id', async () => {
    const mounted = mountHookHarness({
      agentCommand: 'codex',
      uiSessionId: 'ui-session-1',
      providerSessionId: 'codex-session-1',
      cwd: '/repo/worktree-a',
      createdAt: 100,
      initialized: true,
      isRemoteExecution: false,
      onProviderSessionIdChange,
      pollIntervalMs: 1000,
      maxAttempts: 3,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(resolveProviderSession).not.toHaveBeenCalled();
    expect(onProviderSessionIdChange).not.toHaveBeenCalled();

    mounted.unmount();
  });
});
