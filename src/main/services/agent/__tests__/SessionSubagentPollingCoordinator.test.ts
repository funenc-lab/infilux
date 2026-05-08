import type { ListSessionAgentSubagentsResult, LiveAgentSubagent } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionSubagentPollingCoordinator } from '../SessionSubagentPollingCoordinator';

function createSubagent(overrides: Partial<LiveAgentSubagent> = {}): LiveAgentSubagent {
  return {
    id: 'child-1',
    provider: 'codex',
    threadId: 'child-1',
    rootThreadId: 'root-1',
    parentThreadId: 'root-1',
    cwd: '/repo/worktree',
    label: 'Worker',
    status: 'running',
    lastSeenAt: 100,
    ...overrides,
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('SessionSubagentPollingCoordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shares one poller for duplicate targets and fans updates out per subscription', async () => {
    const listSession = vi
      .fn<() => Promise<ListSessionAgentSubagentsResult>>()
      .mockResolvedValueOnce({
        items: [createSubagent()],
        generatedAt: 1,
      })
      .mockResolvedValueOnce({
        items: [createSubagent({ status: 'completed', lastSeenAt: 200 })],
        generatedAt: 2,
      });

    const coordinator = new SessionSubagentPollingCoordinator(
      { listSession },
      { defaultPollIntervalMs: 1_000 }
    );
    const listenerA = vi.fn();
    const listenerB = vi.fn();

    coordinator.subscribe(
      {
        ownerId: 'sender-1',
        subscriptionId: 'sub-1',
        pollIntervalMs: 1_000,
        targets: [
          {
            sessionId: 'ui-session-1',
            providerSessionId: 'root-1',
            cwd: '/repo/worktree',
          },
        ],
      },
      listenerA
    );
    coordinator.subscribe(
      {
        ownerId: 'sender-2',
        subscriptionId: 'sub-2',
        pollIntervalMs: 1_000,
        targets: [
          {
            sessionId: 'ui-session-2',
            providerSessionId: 'root-1',
            cwd: '/repo/worktree',
          },
        ],
      },
      listenerB
    );

    await flushPromises();

    expect(listSession).toHaveBeenCalledTimes(1);
    expect(listSession).toHaveBeenCalledWith({
      providerSessionId: 'root-1',
      cwd: '/repo/worktree',
    });
    expect(listenerA).toHaveBeenLastCalledWith({
      subscriptionId: 'sub-1',
      itemsBySessionId: {
        'ui-session-1': [createSubagent()],
      },
      generatedAt: 1,
    });
    expect(listenerB).toHaveBeenLastCalledWith({
      subscriptionId: 'sub-2',
      itemsBySessionId: {
        'ui-session-2': [createSubagent()],
      },
      generatedAt: 1,
    });

    listenerA.mockClear();
    listenerB.mockClear();

    await vi.advanceTimersByTimeAsync(1_000);
    await flushPromises();

    expect(listSession).toHaveBeenCalledTimes(2);
    expect(listenerA).toHaveBeenLastCalledWith({
      subscriptionId: 'sub-1',
      itemsBySessionId: {
        'ui-session-1': [createSubagent({ status: 'completed', lastSeenAt: 200 })],
      },
      generatedAt: 2,
    });
    expect(listenerB).toHaveBeenLastCalledWith({
      subscriptionId: 'sub-2',
      itemsBySessionId: {
        'ui-session-2': [createSubagent({ status: 'completed', lastSeenAt: 200 })],
      },
      generatedAt: 2,
    });

    coordinator.dispose();
  });

  it('stops polling when the last subscription is removed', async () => {
    const listSession = vi.fn<() => Promise<ListSessionAgentSubagentsResult>>().mockResolvedValue({
      items: [createSubagent()],
      generatedAt: 1,
    });
    const coordinator = new SessionSubagentPollingCoordinator(
      { listSession },
      { defaultPollIntervalMs: 1_000 }
    );

    coordinator.subscribe(
      {
        ownerId: 'sender-1',
        subscriptionId: 'sub-1',
        pollIntervalMs: 1_000,
        targets: [
          {
            sessionId: 'ui-session-1',
            providerSessionId: 'root-1',
            cwd: '/repo/worktree',
          },
        ],
      },
      vi.fn()
    );

    await flushPromises();
    expect(listSession).toHaveBeenCalledTimes(1);

    coordinator.unsubscribe({
      ownerId: 'sender-1',
      subscriptionId: 'sub-1',
    });

    await vi.advanceTimersByTimeAsync(3_000);
    await flushPromises();

    expect(listSession).toHaveBeenCalledTimes(1);

    coordinator.dispose();
  });

  it('retains the last successful snapshot and backs off after polling failures', async () => {
    const listSession = vi
      .fn<() => Promise<ListSessionAgentSubagentsResult>>()
      .mockResolvedValueOnce({
        items: [createSubagent()],
        generatedAt: 1,
      })
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce({
        items: [createSubagent({ status: 'completed', lastSeenAt: 200 })],
        generatedAt: 2,
      });
    const coordinator = new SessionSubagentPollingCoordinator(
      { listSession },
      { defaultPollIntervalMs: 1_000 }
    );
    const listener = vi.fn();

    coordinator.subscribe(
      {
        ownerId: 'sender-1',
        subscriptionId: 'sub-1',
        pollIntervalMs: 1_000,
        targets: [
          {
            sessionId: 'ui-session-1',
            providerSessionId: 'root-1',
            cwd: '/repo/worktree',
          },
        ],
      },
      listener
    );

    await flushPromises();
    expect(listener).toHaveBeenCalledTimes(1);

    listener.mockClear();

    await vi.advanceTimersByTimeAsync(1_000);
    await flushPromises();

    expect(listSession).toHaveBeenCalledTimes(2);
    expect(listener).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    await flushPromises();

    expect(listSession).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1_000);
    await flushPromises();

    expect(listSession).toHaveBeenCalledTimes(3);
    expect(listener).toHaveBeenLastCalledWith({
      subscriptionId: 'sub-1',
      itemsBySessionId: {
        'ui-session-1': [createSubagent({ status: 'completed', lastSeenAt: 200 })],
      },
      generatedAt: 2,
    });

    coordinator.dispose();
  });
});
