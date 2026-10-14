/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Session } from '@/components/chat/SessionBar';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { useAgentSessionSummaries } from '../useAgentSessionSummaries';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('useAgentSessionSummaries', () => {
  let root: Root;
  let container: HTMLDivElement;
  let renderCount: number;
  let summaries: ReturnType<typeof useAgentSessionSummaries>;

  function Harness() {
    summaries = useAgentSessionSummaries();
    renderCount += 1;
    return React.createElement('div', null, summaries.map((session) => session.id).join(','));
  }

  beforeEach(() => {
    renderCount = 0;
    summaries = [];
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

  it('does not include terminal replay content in layout summaries', async () => {
    useAgentSessionsStore.getState().updateSession('session-a', {
      replaySnapshot: 'Terminal history',
      replaySnapshotCapturedAt: 1_000,
    });
    await mount();

    expect(summaries).toEqual([
      {
        id: 'session-a',
        agentId: 'codex',
        agentCommand: 'codex',
        initialized: true,
        sessionId: 'provider-a',
        repoPath: '/repo',
        cwd: '/repo/worktree',
      },
    ]);
  });

  it('keeps the summary reference stable across replay and title changes', async () => {
    await mount();
    const initialSummaries = summaries;
    const initialRenderCount = renderCount;

    for (let update = 0; update < 6; update += 1) {
      await act(async () => {
        useAgentSessionsStore.getState().updateSession('session-a', {
          replaySnapshot: `Output ${update}`,
          replaySnapshotCapturedAt: update,
          name: `Session ${update}`,
        });
      });
    }

    expect(renderCount).toBe(initialRenderCount);
    expect(summaries).toBe(initialSummaries);
  });

  it.each([
    { repoPath: '/other-repo' },
    { cwd: 'infilux-remote://connection/repo/worktree' },
    { initialized: false },
    { agentId: 'claude' },
    { agentCommand: 'claude' },
    { sessionId: 'provider-b' },
  ] satisfies Partial<Session>[])('updates the layout summary for %j', async (updates) => {
    await mount();
    const initialRenderCount = renderCount;

    await act(async () => useAgentSessionsStore.getState().updateSession('session-a', updates));

    expect(renderCount).toBe(initialRenderCount + 1);
    expect(summaries[0]).toMatchObject(updates);
  });

  it('preserves session membership and ordering changes', async () => {
    await mount();
    const initialSession = useAgentSessionsStore.getState().sessions[0];
    const addedSession = { ...initialSession, id: 'session-b' };

    await act(async () => {
      useAgentSessionsStore.setState({ sessions: [initialSession, addedSession] });
    });
    expect(container.textContent).toBe('session-a,session-b');

    await act(async () => {
      useAgentSessionsStore.setState({ sessions: [addedSession, initialSession] });
    });
    expect(container.textContent).toBe('session-b,session-a');

    await act(async () => useAgentSessionsStore.setState({ sessions: [] }));
    expect(summaries).toEqual([]);
    expect(container.textContent).toBe('');
  });
});
