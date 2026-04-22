/* @vitest-environment jsdom */

import type { GetAgentSubagentTranscriptResult, LiveAgentSubagent } from '@shared/types';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSubagentTranscript } from '../useSubagentTranscript';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const getTranscript =
  vi.fn<(request: { threadId: string }) => Promise<GetAgentSubagentTranscriptResult>>();

function createDeferredResult<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

function createSubagent(threadId: string): LiveAgentSubagent {
  return {
    id: `subagent-${threadId}`,
    provider: 'codex',
    threadId,
    rootThreadId: 'root-thread',
    parentThreadId: 'root-thread',
    cwd: '/repo/worktree',
    label: threadId,
    lastSeenAt: 1,
    status: 'running',
  };
}

function createTranscript(threadId: string, text: string): GetAgentSubagentTranscriptResult {
  return {
    provider: 'codex',
    threadId,
    parentThreadId: 'root-thread',
    cwd: '/repo/worktree',
    label: threadId,
    entries: [
      {
        id: `${threadId}-entry-1`,
        timestamp: Date.parse('2026-04-22T08:00:00.000Z'),
        kind: 'message',
        role: 'assistant',
        text,
      },
    ],
    generatedAt: Date.parse('2026-04-22T08:00:00.000Z'),
  };
}

function HookHarness({ subagent }: { subagent: LiveAgentSubagent | null | undefined }) {
  const state = useSubagentTranscript(subagent);

  return React.createElement('div', {
    'data-thread-id': state.data?.threadId ?? '',
    'data-entry-text': state.data?.entries[0]?.text ?? '',
    'data-is-loading': String(state.isLoading),
    'data-is-refreshing': String(state.isRefreshing),
    'data-error': state.error ?? '',
  });
}

function mountHookHarness(subagent: LiveAgentSubagent | null | undefined) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  const render = (nextSubagent: LiveAgentSubagent | null | undefined) => {
    act(() => {
      root.render(React.createElement(HookHarness, { subagent: nextSubagent }));
    });
  };

  render(subagent);

  return {
    container,
    render,
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('useSubagentTranscript', () => {
  beforeEach(() => {
    getTranscript.mockReset();
    window.electronAPI = {
      agentSubagent: {
        getTranscript,
      },
    } as never;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('reuses cached transcript data while refreshing a previously opened subagent tab', async () => {
    const threadOneFirstLoad = createDeferredResult<GetAgentSubagentTranscriptResult>();
    const threadTwoLoad = createDeferredResult<GetAgentSubagentTranscriptResult>();
    const threadOneRefresh = createDeferredResult<GetAgentSubagentTranscriptResult>();

    getTranscript
      .mockImplementationOnce(() => threadOneFirstLoad.promise)
      .mockImplementationOnce(() => threadTwoLoad.promise)
      .mockImplementationOnce(() => threadOneRefresh.promise);

    const mounted = mountHookHarness(createSubagent('thread-1'));

    expect(mounted.container.firstElementChild?.getAttribute('data-is-loading')).toBe('true');
    expect(mounted.container.firstElementChild?.getAttribute('data-thread-id')).toBe('');

    await act(async () => {
      threadOneFirstLoad.resolve(createTranscript('thread-1', 'Thread one cached transcript'));
      await threadOneFirstLoad.promise;
    });

    expect(mounted.container.firstElementChild?.getAttribute('data-thread-id')).toBe('thread-1');
    expect(mounted.container.firstElementChild?.getAttribute('data-entry-text')).toBe(
      'Thread one cached transcript'
    );
    expect(mounted.container.firstElementChild?.getAttribute('data-is-refreshing')).toBe('false');

    mounted.render(createSubagent('thread-2'));

    expect(mounted.container.firstElementChild?.getAttribute('data-is-loading')).toBe('true');
    expect(mounted.container.firstElementChild?.getAttribute('data-thread-id')).toBe('');

    await act(async () => {
      threadTwoLoad.resolve(createTranscript('thread-2', 'Thread two transcript'));
      await threadTwoLoad.promise;
    });

    expect(mounted.container.firstElementChild?.getAttribute('data-thread-id')).toBe('thread-2');
    expect(mounted.container.firstElementChild?.getAttribute('data-entry-text')).toBe(
      'Thread two transcript'
    );

    mounted.render(createSubagent('thread-1'));

    expect(mounted.container.firstElementChild?.getAttribute('data-thread-id')).toBe('thread-1');
    expect(mounted.container.firstElementChild?.getAttribute('data-entry-text')).toBe(
      'Thread one cached transcript'
    );
    expect(mounted.container.firstElementChild?.getAttribute('data-is-loading')).toBe('false');
    expect(mounted.container.firstElementChild?.getAttribute('data-is-refreshing')).toBe('true');

    await act(async () => {
      threadOneRefresh.resolve(createTranscript('thread-1', 'Thread one refreshed transcript'));
      await threadOneRefresh.promise;
    });

    expect(mounted.container.firstElementChild?.getAttribute('data-thread-id')).toBe('thread-1');
    expect(mounted.container.firstElementChild?.getAttribute('data-entry-text')).toBe(
      'Thread one refreshed transcript'
    );
    expect(mounted.container.firstElementChild?.getAttribute('data-is-refreshing')).toBe('false');

    mounted.unmount();
  });
});
