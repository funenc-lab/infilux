/* @vitest-environment jsdom */

import type { LiveAgentSubagent, SessionAgentSubagentsUpdatedEvent } from '@shared/types';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionSubagents } from '../useSessionSubagents';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const subscribeSessionSubagents = vi.fn();
const unsubscribeSessionSubagents = vi.fn();

function createSubagent(overrides: Partial<LiveAgentSubagent> = {}): LiveAgentSubagent {
  return {
    id: 'subagent-1',
    provider: 'codex',
    threadId: 'thread-1',
    rootThreadId: 'root-thread-1',
    parentThreadId: 'root-thread-1',
    cwd: '/Users/tanzv/project/worktree-a',
    label: 'Worker',
    status: 'running',
    lastSeenAt: 1_764_317_600_000,
    ...overrides,
  };
}

let latestResult: ReturnType<typeof useSessionSubagents>;

function HookHarness({ args }: { args: Parameters<typeof useSessionSubagents>[0] }) {
  latestResult = useSessionSubagents(args);
  return React.createElement('div');
}

function mountHookHarness(args: Parameters<typeof useSessionSubagents>[0]) {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const root: Root = createRoot(container);
  act(() => {
    root.render(React.createElement(HookHarness, { args }));
  });

  return {
    rerender(nextArgs: Parameters<typeof useSessionSubagents>[0]) {
      act(() => {
        root.render(React.createElement(HookHarness, { args: nextArgs }));
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('useSessionSubagents', () => {
  beforeEach(() => {
    subscribeSessionSubagents.mockReset();
    unsubscribeSessionSubagents.mockReset();
    latestResult = {
      items: [],
      isLoading: false,
      hasLoaded: false,
    };
    window.electronAPI = {
      agentSubagent: {
        subscribeSessionSubagents,
      },
    } as never;
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('subscribes to session subagent updates for the current provider session', async () => {
    const subagent = createSubagent();
    let latestEventHandler: ((event: SessionAgentSubagentsUpdatedEvent) => void) | undefined;
    subscribeSessionSubagents.mockImplementation(
      (
        _request: unknown,
        callback: (event: SessionAgentSubagentsUpdatedEvent) => void
      ): (() => void) => {
        latestEventHandler = callback;
        return unsubscribeSessionSubagents;
      }
    );

    const mounted = mountHookHarness({
      cwd: '/Users/tanzv/project/worktree-a/',
      providerSessionId: 'root-thread-1',
      enabled: true,
      pollIntervalMs: 1_000,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(subscribeSessionSubagents).toHaveBeenCalledTimes(1);
    const subscriptionRequest = subscribeSessionSubagents.mock.calls[0]?.[0] as {
      subscriptionId: string;
      pollIntervalMs: number;
      targets: Array<{
        sessionId: string;
        providerSessionId: string;
        cwd: string;
      }>;
    };
    expect(subscriptionRequest.pollIntervalMs).toBe(1_000);
    expect(subscriptionRequest.targets).toEqual([
      {
        sessionId: expect.any(String),
        providerSessionId: 'root-thread-1',
        cwd: '/users/tanzv/project/worktree-a',
      },
    ]);
    expect(latestResult.isLoading).toBe(true);

    await act(async () => {
      latestEventHandler?.({
        subscriptionId: subscriptionRequest.subscriptionId,
        itemsBySessionId: {
          [subscriptionRequest.targets[0]?.sessionId ?? 'missing']: [subagent],
        },
        generatedAt: 1,
      });
      await Promise.resolve();
    });

    expect(latestResult.items).toEqual([subagent]);
    expect(latestResult.isLoading).toBe(false);
    expect(latestResult.hasLoaded).toBe(true);

    mounted.unmount();
    expect(unsubscribeSessionSubagents).toHaveBeenCalledTimes(1);
  });

  it('clears items when session subscription becomes disabled', async () => {
    let latestEventHandler: ((event: SessionAgentSubagentsUpdatedEvent) => void) | undefined;
    subscribeSessionSubagents.mockImplementation(
      (
        _request: unknown,
        callback: (event: SessionAgentSubagentsUpdatedEvent) => void
      ): (() => void) => {
        latestEventHandler = callback;
        return unsubscribeSessionSubagents;
      }
    );

    const mounted = mountHookHarness({
      cwd: '/Users/tanzv/project/worktree-a',
      providerSessionId: 'root-thread-1',
      enabled: true,
      pollIntervalMs: 1_000,
    });

    await act(async () => {
      await Promise.resolve();
    });

    const subscriptionRequest = subscribeSessionSubagents.mock.calls[0]?.[0] as {
      subscriptionId: string;
      targets: Array<{ sessionId: string }>;
    };

    await act(async () => {
      latestEventHandler?.({
        subscriptionId: subscriptionRequest.subscriptionId,
        itemsBySessionId: {
          [subscriptionRequest.targets[0]?.sessionId ?? 'missing']: [createSubagent()],
        },
        generatedAt: 1,
      });
      await Promise.resolve();
    });

    expect(latestResult.items).toHaveLength(1);
    expect(latestResult.hasLoaded).toBe(true);

    mounted.rerender({
      cwd: '/Users/tanzv/project/worktree-a',
      providerSessionId: 'root-thread-1',
      enabled: false,
      pollIntervalMs: 1_000,
    });

    expect(latestResult.items).toEqual([]);
    expect(latestResult.isLoading).toBe(false);
    expect(latestResult.hasLoaded).toBe(false);
    expect(unsubscribeSessionSubagents).toHaveBeenCalledTimes(1);

    mounted.unmount();
  });

  it('uses a fresh subscription id when the session target changes', async () => {
    subscribeSessionSubagents.mockImplementation((): (() => void) => unsubscribeSessionSubagents);

    const mounted = mountHookHarness({
      cwd: '/Users/tanzv/project/worktree-a',
      providerSessionId: 'root-thread-1',
      enabled: true,
      pollIntervalMs: 1_000,
    });

    await act(async () => {
      await Promise.resolve();
    });

    mounted.rerender({
      cwd: '/Users/tanzv/project/worktree-b',
      providerSessionId: 'root-thread-2',
      enabled: true,
      pollIntervalMs: 1_000,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(subscribeSessionSubagents).toHaveBeenCalledTimes(2);
    expect(subscribeSessionSubagents.mock.calls[0]?.[0]?.subscriptionId).not.toBe(
      subscribeSessionSubagents.mock.calls[1]?.[0]?.subscriptionId
    );

    mounted.unmount();
  });
});
