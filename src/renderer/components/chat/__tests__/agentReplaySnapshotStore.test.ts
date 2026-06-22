import { describe, expect, it, vi } from 'vitest';
import { createAgentReplaySnapshotStore } from '../agentReplaySnapshotStore';

describe('agent replay snapshot store', () => {
  it('notifies only subscribers for the changed session', () => {
    const store = createAgentReplaySnapshotStore();
    const sessionAListener = vi.fn();
    const sessionBListener = vi.fn();

    const unsubscribeA = store.subscribe('session-a', sessionAListener);
    const unsubscribeB = store.subscribe('session-b', sessionBListener);

    store.setSnapshot('session-a', {
      replaySnapshot: 'latest output',
      replaySnapshotCapturedAt: 1_000,
    });

    expect(sessionAListener).toHaveBeenCalledTimes(1);
    expect(sessionBListener).not.toHaveBeenCalled();
    expect(store.getSnapshot('session-a')).toEqual({
      replaySnapshot: 'latest output',
      replaySnapshotCapturedAt: 1_000,
    });

    unsubscribeA();
    unsubscribeB();
  });

  it('does not notify when replay snapshot content is unchanged', () => {
    const store = createAgentReplaySnapshotStore();
    const listener = vi.fn();
    store.setSnapshot('session-a', {
      replaySnapshot: 'latest output',
      replaySnapshotCapturedAt: 1_000,
    });

    store.subscribe('session-a', listener);
    store.setSnapshot('session-a', {
      replaySnapshot: 'latest output',
      replaySnapshotCapturedAt: 1_000,
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it('prunes snapshots for sessions that are no longer mounted', () => {
    const store = createAgentReplaySnapshotStore();
    const listener = vi.fn();

    store.setSnapshot('session-a', {
      replaySnapshot: 'removed output',
      replaySnapshotCapturedAt: 1_000,
    });
    store.setSnapshot('session-b', {
      replaySnapshot: 'retained output',
      replaySnapshotCapturedAt: 2_000,
    });
    store.subscribe('session-a', listener);

    store.prune(['session-b']);

    expect(store.getSnapshot('session-a')).toBeUndefined();
    expect(store.getSnapshot('session-b')).toEqual({
      replaySnapshot: 'retained output',
      replaySnapshotCapturedAt: 2_000,
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
