/* @vitest-environment jsdom */

import type { LiveAgentSubagent, SessionAgentSubagentsUpdatedEvent } from '@shared/types';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type SessionSubagentPollTarget,
  useSessionSubagentsBySession,
} from '../useSessionSubagentsBySession';

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
    status: 'completed',
    lastSeenAt: 1_764_317_600_000,
    ...overrides,
  };
}

let latestResult: ReturnType<typeof useSessionSubagentsBySession>;

function HookHarness({
  targets,
  enabled = true,
}: {
  targets: SessionSubagentPollTarget[];
  enabled?: boolean;
}) {
  latestResult = useSessionSubagentsBySession({
    targets,
    enabled,
    pollIntervalMs: 1_000,
  });
  return React.createElement('div');
}

function mountHookHarness(targets: SessionSubagentPollTarget[], enabled = true) {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const root: Root = createRoot(container);
  act(() => {
    root.render(React.createElement(HookHarness, { targets, enabled }));
  });

  return {
    rerender(nextTargets: SessionSubagentPollTarget[], nextEnabled = enabled) {
      act(() => {
        root.render(
          React.createElement(HookHarness, { targets: nextTargets, enabled: nextEnabled })
        );
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

describe('useSessionSubagentsBySession', () => {
  beforeEach(() => {
    subscribeSessionSubagents.mockReset();
    unsubscribeSessionSubagents.mockReset();
    latestResult = {
      itemsBySessionId: {},
      isLoading: false,
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

  it('subscribes once for multiple supported sessions and fans updates back by session id', async () => {
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

    const mounted = mountHookHarness([
      {
        sessionId: 'ui-session-1',
        cwd: '/Users/tanzv/project/worktree-a/',
        providerSessionId: 'root-thread-1',
        enabled: true,
      },
      {
        sessionId: 'ui-session-2',
        cwd: '/Users/tanzv/project/worktree-b',
        providerSessionId: 'root-thread-2',
        enabled: true,
      },
    ]);

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
        sessionId: 'ui-session-1',
        providerSessionId: 'root-thread-1',
        cwd: '/users/tanzv/project/worktree-a',
      },
      {
        sessionId: 'ui-session-2',
        providerSessionId: 'root-thread-2',
        cwd: '/users/tanzv/project/worktree-b',
      },
    ]);
    expect(latestResult.isLoading).toBe(true);

    await act(async () => {
      latestEventHandler?.({
        subscriptionId: subscriptionRequest.subscriptionId,
        itemsBySessionId: {
          'ui-session-1': [createSubagent()],
          'ui-session-2': [
            createSubagent({
              id: 'subagent-2',
              threadId: 'thread-2',
              rootThreadId: 'root-thread-2',
              parentThreadId: 'root-thread-2',
              label: 'Reviewer',
              cwd: '/Users/tanzv/project/worktree-b',
            }),
          ],
        },
        generatedAt: 2,
      });
      await Promise.resolve();
    });

    expect(Object.keys(latestResult.itemsBySessionId)).toEqual(['ui-session-1', 'ui-session-2']);
    expect(latestResult.itemsBySessionId['ui-session-1']).toHaveLength(1);
    expect(latestResult.itemsBySessionId['ui-session-2']).toHaveLength(1);
    expect(latestResult.isLoading).toBe(false);

    mounted.unmount();
    expect(unsubscribeSessionSubagents).toHaveBeenCalledTimes(1);
  });

  it('drops cached items when a session becomes unsupported or disabled', async () => {
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

    const mounted = mountHookHarness([
      {
        sessionId: 'ui-session-1',
        cwd: '/Users/tanzv/project/worktree-a',
        providerSessionId: 'root-thread-1',
        enabled: true,
      },
    ]);

    await act(async () => {
      await Promise.resolve();
    });

    const subscriptionRequest = subscribeSessionSubagents.mock.calls[0]?.[0] as {
      subscriptionId: string;
    };

    await act(async () => {
      latestEventHandler?.({
        subscriptionId: subscriptionRequest.subscriptionId,
        itemsBySessionId: {
          'ui-session-1': [createSubagent()],
        },
        generatedAt: 1,
      });
      await Promise.resolve();
    });

    expect(latestResult.itemsBySessionId['ui-session-1']).toHaveLength(1);

    mounted.rerender([
      {
        sessionId: 'ui-session-1',
        cwd: '/Users/tanzv/project/worktree-a',
        providerSessionId: 'root-thread-1',
        enabled: false,
      },
    ]);

    expect(latestResult.itemsBySessionId).toEqual({});
    expect(unsubscribeSessionSubagents).toHaveBeenCalledTimes(1);

    mounted.unmount();
  });

  it('uses a fresh subscription id when the tracked session set changes', async () => {
    subscribeSessionSubagents.mockImplementation((): (() => void) => unsubscribeSessionSubagents);

    const mounted = mountHookHarness([
      {
        sessionId: 'ui-session-1',
        cwd: '/Users/tanzv/project/worktree-a',
        providerSessionId: 'root-thread-1',
        enabled: true,
      },
    ]);

    await act(async () => {
      await Promise.resolve();
    });

    mounted.rerender([
      {
        sessionId: 'ui-session-2',
        cwd: '/Users/tanzv/project/worktree-b',
        providerSessionId: 'root-thread-2',
        enabled: true,
      },
    ]);

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
