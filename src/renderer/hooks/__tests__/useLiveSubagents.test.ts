/* @vitest-environment jsdom */

import type { LiveAgentSubagent } from '@shared/types';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  areLiveSubagentListsEqual,
  buildLiveSubagentCwds,
  buildPolledLiveSubagentCwds,
  useLiveSubagents,
} from '../useLiveSubagents';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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

const listLive = vi.fn();
let latestResult: ReturnType<typeof useLiveSubagents> = new Map();

function HookHarness({ cwds }: { cwds: string[] }) {
  latestResult = useLiveSubagents(cwds);
  return React.createElement('div');
}

function mountHookHarness(cwds: string[]) {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const root: Root = createRoot(container);
  act(() => {
    root.render(React.createElement(HookHarness, { cwds }));
  });

  return {
    rerender(nextCwds: string[]) {
      act(() => {
        root.render(React.createElement(HookHarness, { cwds: nextCwds }));
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

beforeEach(() => {
  vi.stubGlobal('navigator', { platform: 'MacIntel' });
  vi.useFakeTimers();
  listLive.mockReset();
  latestResult = new Map();
  window.electronAPI = {
    agentSubagent: {
      listLive,
    },
  } as never;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('buildLiveSubagentCwds', () => {
  it('normalizes, deduplicates, and sorts cwd inputs by value', () => {
    expect(
      buildLiveSubagentCwds([
        '/Users/tanzv/project/worktree-b',
        '',
        '/Users/tanzv/project/worktree-a',
        '/Users/tanzv/project/worktree-b/',
      ])
    ).toEqual(['/users/tanzv/project/worktree-a', '/users/tanzv/project/worktree-b']);
  });
});

describe('buildPolledLiveSubagentCwds', () => {
  it('only keeps worktrees that are both visible and backed by an active codex session', () => {
    expect(
      buildPolledLiveSubagentCwds(
        ['/Users/tanzv/project/worktree-a/', '/Users/tanzv/project/worktree-b'],
        ['/users/tanzv/project/worktree-b', '/users/tanzv/project/worktree-c']
      )
    ).toEqual(['/users/tanzv/project/worktree-b']);
  });
});

describe('areLiveSubagentListsEqual', () => {
  it('treats equivalent snapshots as equal even when array references differ', () => {
    const left = [createSubagent()];
    const right = [createSubagent()];

    expect(areLiveSubagentListsEqual(left, right)).toBe(true);
  });

  it('detects meaningful subagent changes', () => {
    const left = [createSubagent()];
    const right = [createSubagent({ status: 'waiting' })];

    expect(areLiveSubagentListsEqual(left, right)).toBe(false);
  });

  it('detects metadata changes that affect subagent presentation', () => {
    const left = [createSubagent()];
    const right = [createSubagent({ summary: 'Updated summary' })];

    expect(areLiveSubagentListsEqual(left, right)).toBe(false);
  });

  it('detects parent-session changes that affect session-level activity mapping', () => {
    const left = [createSubagent()];
    const right = [createSubagent({ rootThreadId: 'other-root-thread' })];

    expect(areLiveSubagentListsEqual(left, right)).toBe(false);
  });
});

describe('useLiveSubagents', () => {
  it('treats malformed live-subagent responses as an empty snapshot instead of crashing', async () => {
    listLive.mockResolvedValue(undefined);

    const mounted = mountHookHarness(['/Users/tanzv/project/worktree-a']);

    await act(async () => {
      await Promise.resolve();
    });

    expect(listLive).toHaveBeenCalledWith({
      cwds: ['/users/tanzv/project/worktree-a'],
    });
    expect(latestResult).toEqual(new Map());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
      await Promise.resolve();
    });

    expect(latestResult).toEqual(new Map());

    mounted.unmount();
  });

  it('keeps the last successful snapshot when polling temporarily fails', async () => {
    const subagent = createSubagent();
    listLive
      .mockResolvedValueOnce({ items: [subagent] })
      .mockRejectedValueOnce(new Error('offline'));

    const mounted = mountHookHarness(['/Users/tanzv/project/worktree-a']);

    await act(async () => {
      await Promise.resolve();
    });

    expect(latestResult.get('/users/tanzv/project/worktree-a')).toEqual([subagent]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
      await Promise.resolve();
    });

    expect(latestResult.get('/users/tanzv/project/worktree-a')).toEqual([subagent]);

    mounted.unmount();
  });

  it('stops polling after unmounting or switching to an empty cwd list', async () => {
    listLive.mockResolvedValue({ items: [] });

    const mounted = mountHookHarness(['/Users/tanzv/project/worktree-a']);

    await act(async () => {
      await Promise.resolve();
    });

    expect(listLive).toHaveBeenCalledTimes(1);

    mounted.rerender([]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
      await Promise.resolve();
    });

    expect(listLive).toHaveBeenCalledTimes(1);

    mounted.unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
      await Promise.resolve();
    });

    expect(listLive).toHaveBeenCalledTimes(1);
  });
});
