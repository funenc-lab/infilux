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
let lastDiscoveryState: ReturnType<typeof useAgentProviderSessionDiscovery> | undefined;

function HookHarness({ args }: { args: Parameters<typeof useAgentProviderSessionDiscovery>[0] }) {
  lastDiscoveryState = useAgentProviderSessionDiscovery(args);
  return React.createElement('div');
}

function mountHookHarness(args: Parameters<typeof useAgentProviderSessionDiscovery>[0]) {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const root: Root = createRoot(container);
  let currentArgs = args;

  const render = (nextArgs?: Parameters<typeof useAgentProviderSessionDiscovery>[0]) => {
    if (nextArgs) {
      currentArgs = nextArgs;
    }
    act(() => {
      root.render(React.createElement(HookHarness, { args: currentArgs }));
    });
  };

  render();

  return {
    rerender(nextArgs: Parameters<typeof useAgentProviderSessionDiscovery>[0]) {
      render(nextArgs);
    },
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
    lastDiscoveryState = undefined;
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

  it('validates a distinct codex provider session id when requested', async () => {
    resolveProviderSession.mockResolvedValue({ providerSessionId: 'codex-session-1' });

    const mounted = mountHookHarness({
      agentCommand: 'codex',
      uiSessionId: 'ui-session-1',
      providerSessionId: 'codex-session-1',
      cwd: '/repo/worktree-a',
      createdAt: 100,
      initialized: true,
      isRemoteExecution: false,
      validateResolvedProviderSession: true,
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
    expect(onProviderSessionIdChange).not.toHaveBeenCalled();

    mounted.unmount();
  });

  it('marks a distinct codex provider session id unresolved when validation cannot find it', async () => {
    resolveProviderSession.mockResolvedValue({ providerSessionId: null });

    const mounted = mountHookHarness({
      agentCommand: 'codex',
      uiSessionId: 'ui-session-1',
      providerSessionId: 'stale-provider-session',
      cwd: '/repo/worktree-a',
      createdAt: 100,
      initialized: true,
      isRemoteExecution: false,
      validateResolvedProviderSession: true,
      onProviderSessionIdChange,
      pollIntervalMs: 1000,
      maxAttempts: 3,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(resolveProviderSession).toHaveBeenCalledTimes(1);
    expect(onProviderSessionIdChange).not.toHaveBeenCalled();
    expect(lastDiscoveryState).toMatchObject({
      providerSessionResolutionPending: false,
      resolvedProviderSessionId: null,
    });

    mounted.unmount();
  });

  it('allows recovered codex sessions to resolve provider ids before initialization completes', async () => {
    resolveProviderSession.mockResolvedValue({ providerSessionId: 'codex-session-1' });

    const mounted = mountHookHarness({
      agentCommand: 'codex',
      uiSessionId: 'ui-session-1',
      providerSessionId: 'ui-session-1',
      cwd: '/repo/worktree-a',
      createdAt: 100,
      initialized: false,
      isRemoteExecution: false,
      allowRecoveryBeforeInitialization: true,
      onProviderSessionIdChange,
      pollIntervalMs: 1000,
      maxAttempts: 3,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(resolveProviderSession).toHaveBeenCalledTimes(1);
    expect(onProviderSessionIdChange).toHaveBeenCalledWith('codex-session-1');

    mounted.unmount();
  });

  it('stops polling after the provider session id becomes distinct on rerender', async () => {
    resolveProviderSession.mockResolvedValue({ providerSessionId: null });

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

    mounted.rerender({
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
      await vi.advanceTimersByTimeAsync(1000);
      await Promise.resolve();
    });

    expect(resolveProviderSession).toHaveBeenCalledTimes(1);

    mounted.unmount();
  });

  it('keeps the active discovery loop stable when the callback identity changes', async () => {
    resolveProviderSession.mockResolvedValue({ providerSessionId: null });

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

    mounted.rerender({
      agentCommand: 'codex',
      uiSessionId: 'ui-session-1',
      providerSessionId: 'ui-session-1',
      cwd: '/repo/worktree-a',
      createdAt: 100,
      initialized: true,
      isRemoteExecution: false,
      onProviderSessionIdChange: vi.fn(),
      pollIntervalMs: 1000,
      maxAttempts: 3,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(resolveProviderSession).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      await Promise.resolve();
    });

    expect(resolveProviderSession).toHaveBeenCalledTimes(2);

    mounted.unmount();
  });
});
