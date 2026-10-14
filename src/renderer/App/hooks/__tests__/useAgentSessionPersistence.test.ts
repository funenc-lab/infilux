/* @vitest-environment jsdom */

import type { PersistentAgentSessionRecord } from '@shared/types';
import React, { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@/components/chat/SessionBar';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { createAgentSessionPersistenceCoordinator } from '../agentSessionPersistenceCoordinator';
import { useAgentSessionPersistence } from '../useAgentSessionPersistence';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function makeSession(id: string, name = id): Session {
  return {
    id,
    name,
    agentId: 'claude',
    agentCommand: 'claude',
    initialized: true,
    activated: true,
    persistenceEnabled: true,
    repoPath: '/repo',
    cwd: '/repo/worktree',
  };
}

function makeRecord(session: Session): PersistentAgentSessionRecord {
  return {
    uiSessionId: session.id,
    agentId: session.agentId,
    agentCommand: session.agentCommand,
    environment: 'native',
    repoPath: session.repoPath,
    cwd: session.cwd,
    displayName: session.name,
    activated: true,
    initialized: session.initialized,
    hostKind: 'tmux',
    hostSessionKey: `host-${session.id}`,
    recoveryPolicy: 'auto',
    createdAt: 1,
    updatedAt: 2,
    lastKnownState: 'live',
  };
}

describe('agent session persistence coordinator', () => {
  it('does not serialize unchanged session records on repeated notifications', async () => {
    const coordinator = createAgentSessionPersistenceCoordinator({
      buildRecord: makeRecord,
      isPersistable: () => true,
      markPersistent: async () => undefined,
      abandon: async () => undefined,
    });
    const sessions = [makeSession('session-a'), makeSession('session-b')];
    coordinator.synchronize(sessions);
    await coordinator.flush();

    const stringify = vi.spyOn(JSON, 'stringify');
    try {
      for (let notification = 0; notification < 6; notification += 1) {
        coordinator.synchronize([...sessions]);
      }
      await coordinator.flush();

      expect(stringify).not.toHaveBeenCalled();
    } finally {
      stringify.mockRestore();
      coordinator.dispose();
    }
  });

  it('does not serialize other session records when one session changes', async () => {
    const persistedRecords: PersistentAgentSessionRecord[] = [];
    const coordinator = createAgentSessionPersistenceCoordinator({
      buildRecord: makeRecord,
      isPersistable: () => true,
      markPersistent: async (record) => {
        persistedRecords.push(record);
      },
      abandon: async () => undefined,
    });
    const sessionA = makeSession('session-a');
    const sessionB = makeSession('session-b');
    coordinator.synchronize([sessionA, sessionB]);
    await coordinator.flush();
    persistedRecords.length = 0;

    const stringify = vi.spyOn(JSON, 'stringify');
    try {
      coordinator.synchronize([sessionA, { ...sessionB, name: 'Renamed session' }]);
      await coordinator.flush();

      expect(stringify.mock.calls.map(([value]) => value)).not.toContainEqual(
        expect.objectContaining({ uiSessionId: 'session-a' })
      );
      expect(persistedRecords).toEqual([
        expect.objectContaining({ uiSessionId: 'session-b', displayName: 'Renamed session' }),
      ]);
    } finally {
      stringify.mockRestore();
      coordinator.dispose();
    }
  });

  it('deduplicates six equivalent notifications and rebuilds only the changed session', async () => {
    const buildRecord = vi.fn(makeRecord);
    const markPersistent = vi.fn(async (_record: PersistentAgentSessionRecord) => undefined);
    const coordinator = createAgentSessionPersistenceCoordinator({
      buildRecord,
      isPersistable: () => true,
      markPersistent,
      abandon: vi.fn(async (_uiSessionId: string) => undefined),
    });
    const sessionA = makeSession('session-a');
    const sessionB = makeSession('session-b');

    coordinator.synchronize([sessionA, sessionB]);
    await coordinator.flush();
    buildRecord.mockClear();
    markPersistent.mockClear();

    const changedSessionB = { ...sessionB, name: 'Renamed session' };
    for (let notification = 0; notification < 6; notification += 1) {
      coordinator.synchronize([sessionA, changedSessionB]);
    }
    await coordinator.flush();

    expect(buildRecord).toHaveBeenCalledTimes(1);
    expect(buildRecord).toHaveBeenCalledWith(changedSessionB);
    expect(markPersistent).toHaveBeenCalledTimes(1);
    expect(markPersistent).toHaveBeenCalledWith(
      expect.objectContaining({ uiSessionId: 'session-b', displayName: 'Renamed session' })
    );
  });

  it('waits for removal cleanup before abandoning and re-persisting a re-added session', async () => {
    let resolveCleanup: (() => void) | undefined;
    const cleanup = new Promise<void>((resolve) => {
      resolveCleanup = resolve;
    });
    const events: string[] = [];
    const coordinator = createAgentSessionPersistenceCoordinator({
      buildRecord: makeRecord,
      isPersistable: () => true,
      markPersistent: async (record) => {
        events.push(`mark:${record.uiSessionId}`);
      },
      abandon: async (uiSessionId) => {
        events.push(`abandon:${uiSessionId}`);
      },
      cleanupRemovedRecord: () => {
        events.push('cleanup');
        return cleanup;
      },
    });
    const initialSession = makeSession('session-a');

    coordinator.synchronize([initialSession]);
    await coordinator.flush();
    events.length = 0;

    coordinator.synchronize([]);
    coordinator.synchronize([{ ...initialSession, name: 'Re-added' }]);
    await Promise.resolve();

    expect(events).toEqual(['cleanup']);
    resolveCleanup?.();
    await coordinator.flush();

    expect(events).toEqual(['cleanup', 'abandon:session-a', 'mark:session-a']);
  });
});

function PersistenceHarness({ onRender }: { onRender?: () => void }) {
  useAgentSessionPersistence();
  onRender?.();
  return React.createElement('div');
}

describe('useAgentSessionPersistence', () => {
  let root: Root;
  let container: HTMLDivElement;
  const markPersistent = vi.fn(async (_record: PersistentAgentSessionRecord) => undefined);

  beforeEach(() => {
    markPersistent.mockClear();
    useAgentSessionsStore.setState({ sessions: [makeSession('strict-mode-session')] });
    window.electronAPI = {
      agentSession: {
        markPersistent,
        abandon: vi.fn(async (_uiSessionId: string) => undefined),
      },
      tmux: {
        killSession: vi.fn(async () => undefined),
      },
      session: {
        kill: vi.fn(async () => undefined),
      },
    } as never;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    useAgentSessionsStore.setState({ sessions: [] });
    container.remove();
  });

  it('persists replay updates without re-rendering its owner', async () => {
    const onRender = vi.fn();
    await act(async () => {
      root.render(React.createElement(PersistenceHarness, { onRender }));
    });
    onRender.mockClear();
    markPersistent.mockClear();

    await act(async () => {
      useAgentSessionsStore.getState().updateSession('strict-mode-session', {
        replaySnapshot: 'Updated terminal output',
        replaySnapshotCapturedAt: 1_000,
      });
    });

    expect(markPersistent).toHaveBeenCalledWith(
      expect.objectContaining({
        uiSessionId: 'strict-mode-session',
        metadata: expect.objectContaining({
          persistentAgentSession: expect.objectContaining({
            replaySnapshot: 'Updated terminal output',
            replaySnapshotCapturedAt: 1_000,
          }),
        }),
      })
    );
    expect(onRender).not.toHaveBeenCalled();
  });

  it('persists only the final state when activation and the first title update together', async () => {
    useAgentSessionsStore.setState({
      sessions: [{ ...makeSession('strict-mode-session'), activated: false }],
    });
    await act(async () => {
      root.render(React.createElement(PersistenceHarness));
    });
    expect(markPersistent).not.toHaveBeenCalled();

    await act(async () => {
      const { updateSession } = useAgentSessionsStore.getState();
      updateSession('strict-mode-session', { activated: true });
      updateSession('strict-mode-session', {
        name: 'First user prompt',
        titleSource: 'enhanced-input',
      });
    });

    expect(markPersistent).toHaveBeenCalledTimes(1);
    expect(markPersistent).toHaveBeenCalledWith(
      expect.objectContaining({
        uiSessionId: 'strict-mode-session',
        activated: true,
        displayName: 'First user prompt',
      })
    );
  });

  it('persists updates from separate input turns', async () => {
    await act(async () => {
      root.render(React.createElement(PersistenceHarness));
    });
    markPersistent.mockClear();

    await act(async () => {
      useAgentSessionsStore
        .getState()
        .updateSession('strict-mode-session', { name: 'First title' });
    });
    await act(async () => {
      useAgentSessionsStore
        .getState()
        .updateSession('strict-mode-session', { name: 'Second title' });
    });

    expect(markPersistent.mock.calls.map(([record]) => record.displayName)).toEqual([
      'First title',
      'Second title',
    ]);
  });

  it('cancels pending synchronization when its owner unmounts', async () => {
    await act(async () => {
      root.render(React.createElement(PersistenceHarness));
    });
    markPersistent.mockClear();

    act(() => {
      useAgentSessionsStore.getState().updateSession('strict-mode-session', { name: 'Discarded' });
      root.render(null);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(markPersistent).not.toHaveBeenCalled();
  });

  it('unsubscribes from persistence updates when its owner unmounts', async () => {
    await act(async () => {
      root.render(React.createElement(PersistenceHarness));
    });
    await act(async () => {
      root.render(null);
    });
    markPersistent.mockClear();

    await act(async () => {
      useAgentSessionsStore.getState().updateSession('strict-mode-session', { name: 'Renamed' });
    });

    expect(markPersistent).not.toHaveBeenCalled();
  });

  it('cancels the discarded StrictMode setup queue before the replacement setup persists', async () => {
    await act(async () => {
      root.render(React.createElement(StrictMode, null, React.createElement(PersistenceHarness)));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(markPersistent).toHaveBeenCalledTimes(1);
    expect(markPersistent).toHaveBeenCalledWith(
      expect.objectContaining({ uiSessionId: 'strict-mode-session' })
    );
  });
});
