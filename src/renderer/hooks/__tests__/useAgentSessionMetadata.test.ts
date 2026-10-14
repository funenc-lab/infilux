/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@/components/chat/SessionBar';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { useAgentSessionMetadata } from '../useAgentSessionMetadata';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('useAgentSessionMetadata', () => {
  let root: Root;
  let container: HTMLDivElement;
  let renderCount: number;
  let metadata: ReturnType<typeof useAgentSessionMetadata>;

  function Harness() {
    metadata = useAgentSessionMetadata();
    renderCount += 1;
    return React.createElement('div', null, metadata.map((session) => session.id).join(','));
  }

  beforeEach(() => {
    renderCount = 0;
    metadata = [];
    useAgentSessionsStore.setState({
      sessions: [
        {
          id: 'session-a',
          name: 'Codex',
          agentId: 'codex',
          agentCommand: 'codex',
          initialized: true,
          activated: true,
          sessionId: 'provider-a',
          repoPath: '/repo',
          cwd: '/repo/worktree',
          customArgs: '--model test-model',
          agentRuntimeWarnings: ['Runtime warning'],
          claudeSessionPolicy: null,
          replaySnapshot: 'Retained terminal history',
          replaySnapshotCapturedAt: 1_000,
        },
      ],
      activeIds: {},
      runtimeStates: {},
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    useAgentSessionsStore.setState({ sessions: [] });
  });

  async function mount() {
    await act(async () => root.render(React.createElement(Harness)));
  }

  it('preserves every non-replay field without retaining replay payloads', async () => {
    await mount();

    expect(metadata).toEqual([
      {
        id: 'session-a',
        name: 'Codex',
        agentId: 'codex',
        agentCommand: 'codex',
        initialized: true,
        activated: true,
        sessionId: 'provider-a',
        repoPath: '/repo',
        cwd: '/repo/worktree',
        customArgs: '--model test-model',
        agentRuntimeWarnings: ['Runtime warning'],
        claudeSessionPolicy: null,
      },
    ]);
    expect(metadata[0]).not.toHaveProperty('replaySnapshot');
    expect(metadata[0]).not.toHaveProperty('replaySnapshotCapturedAt');
  });

  it('keeps metadata references stable across replay-only changes', async () => {
    await mount();
    const initialMetadata = metadata;
    const initialRenderCount = renderCount;

    for (let update = 0; update < 6; update += 1) {
      await act(async () => {
        useAgentSessionsStore.getState().updateSession('session-a', {
          replaySnapshot: `Output ${update}`,
          replaySnapshotCapturedAt: 2_000 + update,
        });
      });
    }
    await act(async () => {
      useAgentSessionsStore.getState().updateSession('session-a', {
        replaySnapshot: undefined,
        replaySnapshotCapturedAt: undefined,
      });
    });

    expect(renderCount).toBe(initialRenderCount);
    expect(metadata).toBe(initialMetadata);
  });

  it.each([
    { name: 'Renamed session' },
    { defaultName: 'Default label' },
    { titleSource: 'manual' },
    { userRenamed: true },
    { repoPath: '/other-repo' },
    { cwd: '/__enso_remote__/connection/repo/worktree' },
    { initialized: false },
    { activated: false },
    { agentId: 'claude' },
    { agentCommand: 'claude' },
    { sessionId: 'provider-b' },
    { backendSessionId: 'backend-b' },
    { customPath: '/opt/agent' },
    { customArgs: '--model another-model' },
    { pendingCommand: 'Queued prompt' },
    { displayOrder: 2 },
    { persistenceEnabled: true },
    { recoveryState: 'dead' },
    { agentCapabilityWarnings: ['Capability warning'] },
    { agentRuntimeWarnings: ['Updated runtime warning'] },
    { claudePolicyStale: true },
  ] satisfies Partial<Session>[])('publishes metadata changes for %j', async (updates) => {
    await mount();
    const initialRenderCount = renderCount;

    await act(async () => useAgentSessionsStore.getState().updateSession('session-a', updates));

    expect(renderCount).toBe(initialRenderCount + 1);
    expect(metadata[0]).toMatchObject(updates);
  });

  it('preserves unchanged siblings and session membership ordering', async () => {
    const firstSession = useAgentSessionsStore.getState().sessions[0];
    const secondSession = { ...firstSession, id: 'session-b' };
    useAgentSessionsStore.setState({ sessions: [firstSession, secondSession] });
    await mount();
    const secondMetadata = metadata[1];

    await act(async () => {
      useAgentSessionsStore.getState().updateSession('session-a', { name: 'Updated label' });
    });
    expect(metadata[1]).toBe(secondMetadata);

    await act(async () => {
      const [first, second] = useAgentSessionsStore.getState().sessions;
      useAgentSessionsStore.setState({ sessions: [second, first] });
    });
    expect(container.textContent).toBe('session-b,session-a');

    await act(async () => useAgentSessionsStore.setState({ sessions: [secondSession] }));
    expect(container.textContent).toBe('session-b');

    await act(async () => useAgentSessionsStore.setState({ sessions: [] }));
    expect(metadata).toEqual([]);
    expect(container.textContent).toBe('');
  });

  it('does not publish an equivalent sessions array or runtime-only state changes', async () => {
    await mount();
    const initialRenderCount = renderCount;
    const initialMetadata = metadata;

    await act(async () => {
      useAgentSessionsStore.setState({ sessions: [...useAgentSessionsStore.getState().sessions] });
      useAgentSessionsStore.getState().setWaitingForInput('session-a', true);
    });

    expect(renderCount).toBe(initialRenderCount);
    expect(metadata).toBe(initialMetadata);
  });

  it('unsubscribes when its owner unmounts', async () => {
    const unsubscribe = vi.fn();
    const subscribed = vi.fn();
    const originalUseSyncExternalStore = React.useSyncExternalStore;
    const subscribeSpy = vi
      .spyOn(React, 'useSyncExternalStore')
      .mockImplementation(
        <Snapshot>(
          subscribe: (listener: () => void) => () => void,
          getSnapshot: () => Snapshot,
          getServerSnapshot?: () => Snapshot
        ) =>
          originalUseSyncExternalStore(
            (listener) => {
              subscribed();
              const removeListener = subscribe(listener);
              return () => {
                unsubscribe();
                removeListener();
              };
            },
            getSnapshot,
            getServerSnapshot
          )
      );

    try {
      await mount();
      expect(subscribed).toHaveBeenCalledOnce();
      expect(unsubscribe).not.toHaveBeenCalled();
      await act(async () => root.render(null));
      expect(unsubscribe).toHaveBeenCalledOnce();
      const unmountedRenderCount = renderCount;

      await act(async () => {
        useAgentSessionsStore.getState().updateSession('session-a', { name: 'After unmount' });
      });

      expect(renderCount).toBe(unmountedRenderCount);
    } finally {
      subscribeSpy.mockRestore();
    }
  });
});
