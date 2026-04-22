/* @vitest-environment jsdom */

import type { LiveAgentSubagent } from '@shared/types';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionSubagents } from '../useSessionSubagents';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const listSession = vi.fn();

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
    vi.useFakeTimers();
    listSession.mockReset();
    latestResult = {
      items: [],
      isLoading: false,
    };
    window.electronAPI = {
      agentSubagent: {
        listSession,
      },
    } as never;
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('loads and polls session subagents for the current provider session', async () => {
    const subagent = createSubagent();
    listSession
      .mockResolvedValueOnce({ items: [subagent], generatedAt: 1 })
      .mockResolvedValueOnce({ items: [subagent], generatedAt: 2 });

    const mounted = mountHookHarness({
      cwd: '/Users/tanzv/project/worktree-a/',
      providerSessionId: 'root-thread-1',
      enabled: true,
      pollIntervalMs: 1_000,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(listSession).toHaveBeenCalledTimes(1);
    expect(listSession).toHaveBeenCalledWith({
      providerSessionId: 'root-thread-1',
      cwd: '/users/tanzv/project/worktree-a',
    });
    expect(latestResult.items).toEqual([subagent]);
    expect(latestResult.isLoading).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
      await Promise.resolve();
    });

    expect(listSession).toHaveBeenCalledTimes(2);

    mounted.unmount();
  });

  it('clears items when session polling becomes disabled', async () => {
    listSession.mockResolvedValueOnce({
      items: [createSubagent()],
      generatedAt: 1,
    });

    const mounted = mountHookHarness({
      cwd: '/Users/tanzv/project/worktree-a',
      providerSessionId: 'root-thread-1',
      enabled: true,
      pollIntervalMs: 1_000,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(latestResult.items).toHaveLength(1);

    mounted.rerender({
      cwd: '/Users/tanzv/project/worktree-a',
      providerSessionId: 'root-thread-1',
      enabled: false,
      pollIntervalMs: 1_000,
    });

    expect(latestResult.items).toEqual([]);
    expect(latestResult.isLoading).toBe(false);

    mounted.unmount();
  });
});
