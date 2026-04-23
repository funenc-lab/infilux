import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@/components/chat/SessionBar';

function createLocalStorageMock(initial?: Record<string, string>) {
  const data = new Map(Object.entries(initial ?? {}));
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      data.delete(key);
    }),
    clear: vi.fn(() => {
      data.clear();
    }),
  };
}

async function loadAgentSessionsModule() {
  vi.resetModules();
  const localStorageMock = createLocalStorageMock();
  vi.stubGlobal('localStorage', localStorageMock);
  const module = await import('../agentSessions');
  return {
    ...module,
    localStorageMock,
  };
}

function makeSession(overrides: Partial<Session> = {}) {
  return {
    id: 'session-1',
    sessionId: 'provider-1',
    name: 'Claude',
    agentId: 'claude',
    agentCommand: 'claude',
    initialized: true,
    activated: true,
    repoPath: '/repo',
    cwd: '/repo/worktree-a',
    environment: 'native' as const,
    persistenceEnabled: false,
    ...overrides,
  };
}

describe('agentSessions aggregation store', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('computes aggregated counts and highest output priority from runtime states', async () => {
    const { computeAggregatedState, computeHighestOutputState } = await loadAgentSessionsModule();

    const sessions = [{ id: 'idle' }, { id: 'outputting' }, { id: 'unread' }];
    const runtimeStates = {
      idle: { outputState: 'idle' as const },
      outputting: { outputState: 'outputting' as const },
      unread: { outputState: 'unread' as const },
    };

    expect(computeAggregatedState(sessions, runtimeStates)).toEqual({
      total: 3,
      outputting: 1,
      unread: 1,
    });
    expect(computeHighestOutputState(sessions, runtimeStates)).toBe('outputting');
    expect(computeHighestOutputState([{ id: 'unread' }], runtimeStates)).toBe('unread');
    expect(computeHighestOutputState([{ id: 'idle' }], runtimeStates)).toBe('idle');
  });

  it('treats sessions without runtime state as idle when computing the highest output state', async () => {
    const { computeHighestOutputState } = await loadAgentSessionsModule();

    expect(computeHighestOutputState([{ id: 'missing-runtime' }], {})).toBe('idle');
  });

  it('handles output state transitions and aggregates sessions by worktree, repo, and globally', async () => {
    const { useAgentSessionsStore } = await loadAgentSessionsModule();
    const store = useAgentSessionsStore.getState();

    store.addSession(
      makeSession({
        id: 'session-a',
        cwd: '/repo/worktree-a/',
      })
    );
    store.addSession(
      makeSession({
        id: 'session-b',
        sessionId: 'provider-2',
        cwd: '/repo/worktree-a',
      })
    );
    store.addSession(
      makeSession({
        id: 'session-c',
        sessionId: 'provider-3',
        cwd: '/repo/worktree-b',
      })
    );
    store.addSession(
      makeSession({
        id: 'session-d',
        sessionId: 'provider-4',
        repoPath: '/other',
        cwd: '/other/worktree',
      })
    );

    store.setOutputState('session-a', 'outputting', true);
    store.setOutputState('session-a', 'idle', false);
    store.setOutputState('session-b', 'outputting', false);
    store.setOutputState('session-b', 'idle', true);
    store.setOutputState('session-c', 'unread');

    const stateAfterTransitions = useAgentSessionsStore.getState();
    expect(stateAfterTransitions.getOutputState('session-a')).toBe('unread');
    expect(stateAfterTransitions.getOutputState('session-b')).toBe('idle');
    expect(stateAfterTransitions.getOutputState('session-c')).toBe('unread');
    expect(stateAfterTransitions.getOutputState('missing-session')).toBe('idle');

    expect(stateAfterTransitions.getAggregatedByWorktree('/repo/worktree-a')).toEqual({
      total: 2,
      outputting: 0,
      unread: 1,
    });
    expect(stateAfterTransitions.getAggregatedByRepo('/repo')).toEqual({
      total: 3,
      outputting: 0,
      unread: 2,
    });
    expect(stateAfterTransitions.getAggregatedGlobal()).toEqual({
      total: 4,
      outputting: 0,
      unread: 2,
    });

    const unreadStateSnapshot = useAgentSessionsStore.getState().runtimeStates;
    store.setOutputState('session-c', 'unread');
    expect(useAgentSessionsStore.getState().runtimeStates).toBe(unreadStateSnapshot);

    store.setOutputState('session-c', 'idle');
    expect(useAgentSessionsStore.getState().runtimeStates).toBe(unreadStateSnapshot);
  });

  it('marks sessions as read or active across missing, outputting, unread, completed-task, and idle states', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(10_000);

    const { useAgentSessionsStore } = await loadAgentSessionsModule();
    const store = useAgentSessionsStore.getState();

    store.addSession(
      makeSession({
        id: 'session-outputting',
      })
    );
    store.addSession(
      makeSession({
        id: 'session-unread',
        sessionId: 'provider-2',
      })
    );
    store.addSession(
      makeSession({
        id: 'session-completed',
        sessionId: 'provider-3',
      })
    );
    store.addSession(
      makeSession({
        id: 'session-idle',
        sessionId: 'provider-4',
      })
    );

    useAgentSessionsStore.setState((state) => ({
      runtimeStates: {
        ...state.runtimeStates,
        'session-outputting': {
          outputState: 'outputting',
          lastActivityAt: 1,
          wasActiveWhenOutputting: false,
          waitingForInput: true,
          hasCompletedTaskUnread: true,
        },
        'session-unread': {
          outputState: 'unread',
          lastActivityAt: 2,
          wasActiveWhenOutputting: false,
          waitingForInput: true,
          hasCompletedTaskUnread: true,
        },
        'session-completed': {
          outputState: 'idle',
          lastActivityAt: 3,
          wasActiveWhenOutputting: false,
          waitingForInput: false,
          hasCompletedTaskUnread: true,
        },
        'session-idle': {
          outputState: 'idle',
          lastActivityAt: 4,
          wasActiveWhenOutputting: false,
          waitingForInput: true,
          hasCompletedTaskUnread: false,
        },
      },
    }));

    store.markSessionActive('missing-session');
    store.markSessionActive('session-outputting');
    store.markSessionActive('session-unread');
    store.markSessionActive('session-completed');
    store.markSessionActive('session-idle');

    const activeState = useAgentSessionsStore.getState();
    expect(activeState.getRuntimeState('missing-session')).toEqual({
      outputState: 'idle',
      lastActivityAt: 10_000,
      wasActiveWhenOutputting: false,
      waitingForInput: false,
      hasCompletedTaskUnread: false,
    });
    expect(activeState.getRuntimeState('session-outputting')).toMatchObject({
      outputState: 'outputting',
      wasActiveWhenOutputting: true,
      waitingForInput: true,
      hasCompletedTaskUnread: false,
    });
    expect(activeState.getRuntimeState('session-unread')).toMatchObject({
      outputState: 'idle',
      waitingForInput: true,
      hasCompletedTaskUnread: false,
    });
    expect(activeState.getRuntimeState('session-completed')).toMatchObject({
      outputState: 'idle',
      hasCompletedTaskUnread: false,
    });
    expect(activeState.getRuntimeState('session-idle')).toMatchObject({
      outputState: 'idle',
      waitingForInput: true,
      hasCompletedTaskUnread: false,
    });

    const idleSnapshot = useAgentSessionsStore.getState().runtimeStates;
    store.markAsRead('session-idle');
    expect(useAgentSessionsStore.getState().runtimeStates).toBe(idleSnapshot);

    useAgentSessionsStore.setState((state) => ({
      runtimeStates: {
        ...state.runtimeStates,
        'session-unread': {
          outputState: 'unread',
          lastActivityAt: 11_000,
          wasActiveWhenOutputting: false,
          waitingForInput: false,
          hasCompletedTaskUnread: false,
        },
      },
    }));

    store.markAsRead('session-unread');
    expect(useAgentSessionsStore.getState().getRuntimeState('session-unread')).toMatchObject({
      outputState: 'idle',
    });
  });

  it('resets enhanced input drafts and attachment tray state while preserving noop branches', async () => {
    const { useAgentSessionsStore } = await loadAgentSessionsModule();
    const store = useAgentSessionsStore.getState();

    const attachmentA = {
      id: '/tmp/mock-a.png',
      kind: 'image' as const,
      name: 'mock-a.png',
      path: '/tmp/mock-a.png',
    };
    const attachmentB = {
      id: '/tmp/mock-b.png',
      kind: 'image' as const,
      name: 'mock-b.png',
      path: '/tmp/mock-b.png',
    };

    store.setEnhancedInputOpen('session-1', true);
    store.setEnhancedInputContent('session-1', 'Draft message');
    store.setEnhancedInputAttachments('session-1', [attachmentA]);

    const missingEnhancedInputSnapshot = useAgentSessionsStore.getState().enhancedInputStates;
    store.clearEnhancedInput('missing-session');
    expect(useAgentSessionsStore.getState().enhancedInputStates).toBe(missingEnhancedInputSnapshot);

    store.clearEnhancedInput('session-1', true);
    expect(useAgentSessionsStore.getState().getEnhancedInputState('session-1')).toEqual({
      open: true,
      content: '',
      attachments: [],
    });

    store.setAttachmentTrayAttachments('session-1', [attachmentA]);
    store.appendAttachmentTrayAttachments('session-1', [attachmentA, attachmentB]);
    store.setAttachmentTrayImporting('session-1', true);
    expect(useAgentSessionsStore.getState().getAttachmentTrayState('session-1')).toEqual({
      attachments: [attachmentA, attachmentB],
      isImporting: true,
    });

    const missingTraySnapshot = useAgentSessionsStore.getState().attachmentTrayStates;
    store.clearAttachmentTray('missing-session');
    expect(useAgentSessionsStore.getState().attachmentTrayStates).toBe(missingTraySnapshot);

    store.clearAttachmentTray('session-1');
    expect(useAgentSessionsStore.getState().getAttachmentTrayState('session-1')).toEqual({
      attachments: [],
      isImporting: false,
    });
  });

  it('tracks unread task markers and clears runtime state for recoverable and disposable sessions', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(20_000);

    const { useAgentSessionsStore } = await loadAgentSessionsModule();
    const store = useAgentSessionsStore.getState();

    store.addSession(
      makeSession({
        id: 'session-a',
        cwd: '/repo/worktree-a/',
      })
    );
    store.addSession(
      makeSession({
        id: 'session-b',
        sessionId: 'provider-2',
        cwd: '/repo/worktree-a',
      })
    );
    store.addSession(
      makeSession({
        id: 'session-c',
        sessionId: 'provider-3',
        cwd: '/repo/worktree-b',
      })
    );
    store.addSession(
      makeSession({
        id: 'session-d',
        sessionId: 'provider-4',
        cwd: '/repo/worktree-a',
      })
    );

    store.markTaskCompletedUnread('session-a');
    store.clearTaskCompletedUnread('session-a');
    expect(useAgentSessionsStore.getState().getRuntimeState('session-a')).toMatchObject({
      hasCompletedTaskUnread: false,
    });
    store.markTaskCompletedUnread('session-a');
    const unreadSnapshot = useAgentSessionsStore.getState().runtimeStates;
    store.markTaskCompletedUnread('session-a');
    expect(useAgentSessionsStore.getState().runtimeStates).toBe(unreadSnapshot);

    const clearMissingSnapshot = useAgentSessionsStore.getState().runtimeStates;
    store.clearTaskCompletedUnread('session-c');
    expect(useAgentSessionsStore.getState().runtimeStates).toBe(clearMissingSnapshot);

    useAgentSessionsStore.setState((state) => ({
      runtimeStates: {
        ...state.runtimeStates,
        'session-b': {
          outputState: 'unread',
          lastActivityAt: 123,
          wasActiveWhenOutputting: false,
          waitingForInput: true,
          hasCompletedTaskUnread: true,
        },
        'session-c': {
          outputState: 'idle',
          lastActivityAt: 456,
          wasActiveWhenOutputting: false,
          waitingForInput: false,
          hasCompletedTaskUnread: false,
        },
      },
    }));

    store.clearTaskCompletedUnreadByWorktree('/repo/worktree-a');
    expect(useAgentSessionsStore.getState().getRuntimeState('session-a')).toMatchObject({
      hasCompletedTaskUnread: false,
    });
    expect(useAgentSessionsStore.getState().getRuntimeState('session-b')).toMatchObject({
      hasCompletedTaskUnread: false,
      waitingForInput: true,
    });
    expect(useAgentSessionsStore.getState().getRuntimeState('session-c')).toMatchObject({
      hasCompletedTaskUnread: false,
    });

    const unchangedAfterWorktreeClear = useAgentSessionsStore.getState().runtimeStates;
    store.clearTaskCompletedUnreadByWorktree('/repo/missing');
    expect(useAgentSessionsStore.getState().runtimeStates).toBe(unchangedAfterWorktreeClear);

    const missingRuntimeSnapshot = useAgentSessionsStore.getState().runtimeStates;
    store.clearRuntimeState('missing-session');
    expect(useAgentSessionsStore.getState().runtimeStates).toBe(missingRuntimeSnapshot);

    useAgentSessionsStore.setState((state) => ({
      runtimeStates: {
        ...state.runtimeStates,
        recoverable: {
          outputState: 'outputting',
          lastActivityAt: 789,
          wasActiveWhenOutputting: true,
          waitingForInput: true,
          hasCompletedTaskUnread: true,
        },
        disposable: {
          outputState: 'idle',
          lastActivityAt: 999,
          wasActiveWhenOutputting: false,
          waitingForInput: false,
          hasCompletedTaskUnread: false,
        },
      },
    }));

    store.clearRuntimeState('recoverable');
    store.clearRuntimeState('disposable');

    const finalState = useAgentSessionsStore.getState();
    expect(finalState.getRuntimeState('recoverable')).toEqual({
      outputState: 'unread',
      lastActivityAt: 789,
      wasActiveWhenOutputting: false,
      waitingForInput: true,
      hasCompletedTaskUnread: true,
    });
    expect(finalState.getRuntimeState('disposable')).toBeUndefined();
  });

  it('updates waiting-for-input state through create, noop, and mutation branches', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(30_000);

    const { useAgentSessionsStore } = await loadAgentSessionsModule();
    const store = useAgentSessionsStore.getState();

    store.setWaitingForInput('session-waiting', true);
    expect(useAgentSessionsStore.getState().getRuntimeState('session-waiting')).toEqual({
      outputState: 'idle',
      lastActivityAt: 30_000,
      wasActiveWhenOutputting: false,
      waitingForInput: true,
      hasCompletedTaskUnread: false,
    });

    const waitingSnapshot = useAgentSessionsStore.getState().runtimeStates;
    store.setWaitingForInput('session-waiting', true);
    expect(useAgentSessionsStore.getState().runtimeStates).toBe(waitingSnapshot);

    store.setWaitingForInput('session-waiting', false);
    expect(useAgentSessionsStore.getState().getRuntimeState('session-waiting')).toMatchObject({
      waitingForInput: false,
    });
  });

  it('sorts sessions per worktree and resolves the active session with repo-aware fallback', async () => {
    const { useAgentSessionsStore } = await loadAgentSessionsModule();
    const store = useAgentSessionsStore.getState();

    store.addSession(
      makeSession({
        id: 'session-a',
      })
    );
    store.addSession(
      makeSession({
        id: 'session-b',
        sessionId: 'provider-2',
        cwd: '/repo/worktree-a/',
      })
    );
    store.addSession(
      makeSession({
        id: 'session-c',
        sessionId: 'provider-3',
        repoPath: '/other',
      })
    );

    store.updateSession('session-a', { displayOrder: 2 });
    store.updateSession('session-b', { displayOrder: 1 });
    store.setActiveId('/repo/worktree-a', 'session-c');

    expect(store.getSessions('/repo', '/repo/worktree-a')).toEqual([
      expect.objectContaining({ id: 'session-b' }),
      expect.objectContaining({ id: 'session-a' }),
    ]);
    expect(store.getActiveSessionId('/repo', '/repo/worktree-a/')).toBe('session-a');

    store.setActiveId('/repo/worktree-a', 'session-a');
    expect(store.getActiveSessionId('/repo', '/repo/worktree-a')).toBe('session-a');
    expect(store.getActiveSessionId('/missing', '/repo/unknown')).toBeNull();
  });

  it('reorders worktree sessions through valid and noop branches and removes stored group state', async () => {
    const { useAgentSessionsStore } = await loadAgentSessionsModule();
    const store = useAgentSessionsStore.getState();

    store.addSession(
      makeSession({
        id: 'session-a',
        displayOrder: 0,
      })
    );
    store.addSession(
      makeSession({
        id: 'session-b',
        sessionId: 'provider-2',
        cwd: '/repo/worktree-a/',
        displayOrder: 1,
      })
    );
    store.addSession(
      makeSession({
        id: 'session-c',
        sessionId: 'provider-3',
        displayOrder: 2,
      })
    );
    store.addSession(
      makeSession({
        id: 'session-d',
        sessionId: 'provider-4',
        repoPath: '/other',
        cwd: '/other/worktree',
        displayOrder: 0,
      })
    );

    store.setGroupState('/repo/worktree-a', {
      groups: [
        {
          id: 'group-1',
          sessionIds: ['session-a', 'session-b', 'session-c'],
          activeSessionId: 'session-a',
        },
      ],
      activeGroupId: 'group-1',
      flexPercents: [100],
    });

    const initialSessions = useAgentSessionsStore.getState().sessions;
    store.reorderSessions('/repo', '/repo/worktree-a', -1, 1);
    expect(useAgentSessionsStore.getState().sessions).toBe(initialSessions);

    store.reorderSessions('/repo', '/repo/worktree-a', 0, 9);
    expect(useAgentSessionsStore.getState().sessions).toBe(initialSessions);

    store.reorderSessions('/repo', '/repo/worktree-a', 0, 2);

    const reorderedState = useAgentSessionsStore.getState();
    expect(reorderedState.getSessions('/repo', '/repo/worktree-a')).toEqual([
      expect.objectContaining({ id: 'session-b', displayOrder: 0 }),
      expect.objectContaining({ id: 'session-c', displayOrder: 1 }),
      expect.objectContaining({ id: 'session-a', displayOrder: 2 }),
    ]);
    expect(reorderedState.getSessions('/other', '/other/worktree')).toEqual([
      expect.objectContaining({ id: 'session-d', displayOrder: 0 }),
    ]);

    expect(reorderedState.groupStates['/repo/worktree-a']).toBeDefined();
    store.removeGroupState('/repo/worktree-a/');
    expect(useAgentSessionsStore.getState().groupStates['/repo/worktree-a']).toBeUndefined();
  });
});
