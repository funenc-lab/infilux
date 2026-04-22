/* @vitest-environment jsdom */

import type { LiveAgentSubagent } from '@shared/types';
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
    vi.useFakeTimers();
    listSession.mockReset();
    latestResult = {
      itemsBySessionId: {},
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

  it('loads session-scoped subagents for multiple supported sessions', async () => {
    listSession
      .mockResolvedValueOnce({
        items: [createSubagent()],
        generatedAt: 1,
      })
      .mockResolvedValueOnce({
        items: [
          createSubagent({
            id: 'subagent-2',
            threadId: 'thread-2',
            rootThreadId: 'root-thread-2',
            parentThreadId: 'root-thread-2',
            label: 'Reviewer',
            cwd: '/Users/tanzv/project/worktree-b',
          }),
        ],
        generatedAt: 2,
      });

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

    expect(listSession).toHaveBeenCalledTimes(2);
    expect(listSession).toHaveBeenNthCalledWith(1, {
      providerSessionId: 'root-thread-1',
      cwd: '/users/tanzv/project/worktree-a',
    });
    expect(listSession).toHaveBeenNthCalledWith(2, {
      providerSessionId: 'root-thread-2',
      cwd: '/users/tanzv/project/worktree-b',
    });
    expect(Object.keys(latestResult.itemsBySessionId)).toEqual(['ui-session-1', 'ui-session-2']);
    expect(latestResult.itemsBySessionId['ui-session-1']).toHaveLength(1);
    expect(latestResult.itemsBySessionId['ui-session-2']).toHaveLength(1);

    mounted.unmount();
  });

  it('drops cached items when a session becomes unsupported or disabled', async () => {
    listSession.mockResolvedValueOnce({
      items: [createSubagent()],
      generatedAt: 1,
    });

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

    mounted.unmount();
  });
});
