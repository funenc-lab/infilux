import type { PersistentAgentSessionRecord } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

async function loadAgentSessionsStore(initialStorage?: Record<string, string>) {
  vi.resetModules();
  const localStorageMock = createLocalStorageMock(initialStorage);
  vi.stubGlobal('localStorage', localStorageMock);
  const module = await import('../agentSessions');
  return {
    useAgentSessionsStore: module.useAgentSessionsStore,
    localStorageMock,
  };
}

function makeRecoveredRecord(
  overrides: Partial<PersistentAgentSessionRecord> = {}
): PersistentAgentSessionRecord {
  return {
    uiSessionId: 'session-1',
    backendSessionId: 'backend-stale',
    providerSessionId: 'provider-1',
    agentId: 'codex',
    agentCommand: 'codex',
    environment: 'native',
    repoPath: '/repo',
    cwd: '/repo/worktree',
    displayName: 'Codex',
    activated: true,
    initialized: true,
    hostKind: 'tmux',
    hostSessionKey: 'enso-session-1',
    recoveryPolicy: 'auto',
    createdAt: 1,
    updatedAt: 2,
    lastKnownState: 'live',
    ...overrides,
  };
}

describe('agent session recovery store', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('persists only sessions whose recovery host is enabled', async () => {
    const env = await loadAgentSessionsStore();
    const store = env.useAgentSessionsStore.getState();

    store.addSession({
      id: 'session-1',
      sessionId: 'provider-1',
      name: 'Codex',
      agentId: 'codex',
      agentCommand: 'codex',
      initialized: true,
      activated: true,
      persistenceEnabled: false,
      repoPath: '/repo',
      cwd: '/repo/worktree',
      environment: 'native',
    });

    const savedPayload = env.localStorageMock.setItem.mock.calls.at(-1)?.[1];
    expect(savedPayload).toBeTruthy();
    expect(JSON.parse(savedPayload as string).sessions).toEqual([]);

    store.updateSession('session-1', { persistenceEnabled: true });

    const persistedPayload = env.localStorageMock.setItem.mock.calls.at(-1)?.[1];
    expect(JSON.parse(persistedPayload as string).sessions).toEqual([
      expect.objectContaining({ id: 'session-1', agentCommand: 'codex' }),
    ]);
  });

  it('keeps exited sessions in the store and marks them as dead for inspection', async () => {
    const env = await loadAgentSessionsStore();
    const store = env.useAgentSessionsStore.getState();

    store.addSession({
      id: 'session-1',
      sessionId: 'provider-1',
      backendSessionId: 'backend-1',
      name: 'Codex',
      agentId: 'codex',
      agentCommand: 'codex',
      initialized: true,
      activated: true,
      persistenceEnabled: true,
      repoPath: '/repo',
      cwd: '/repo/worktree',
      environment: 'native',
    });
    store.setOutputState('session-1', 'outputting', false);
    store.markSessionExited('session-1');

    const nextState = env.useAgentSessionsStore.getState();
    expect(nextState.sessions).toEqual([
      expect.objectContaining({
        id: 'session-1',
        backendSessionId: undefined,
        recoveryState: 'dead',
      }),
    ]);
    expect(nextState.getRuntimeState('session-1')).toMatchObject({
      outputState: 'unread',
      wasActiveWhenOutputting: false,
    });
  });

  it('upserts recovered sessions and preserves backend session ids for host reattach', async () => {
    const env = await loadAgentSessionsStore();
    const store = env.useAgentSessionsStore.getState();

    store.upsertRecoveredSession(makeRecoveredRecord());

    expect(env.useAgentSessionsStore.getState().sessions).toEqual([
      expect.objectContaining({
        id: 'session-1',
        sessionId: 'provider-1',
        backendSessionId: 'backend-stale',
        recovered: true,
        recoveryState: 'live',
        agentCommand: 'codex',
      }),
    ]);
  });

  it('returns a stable default attachment tray state for missing sessions', async () => {
    const env = await loadAgentSessionsStore();
    const store = env.useAgentSessionsStore.getState();

    const firstSnapshot = store.getAttachmentTrayState('missing-session');
    const secondSnapshot = store.getAttachmentTrayState('missing-session');

    expect(firstSnapshot).toBe(secondSnapshot);
    expect(firstSnapshot.attachments).toBe(secondSnapshot.attachments);
    expect(firstSnapshot).toEqual({
      attachments: [],
      isImporting: false,
    });
  });

  it('treats /var and /private/var worktree paths as the same recovered worktree on darwin', async () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
    const env = await loadAgentSessionsStore();
    const store = env.useAgentSessionsStore.getState();

    store.upsertRecoveredSession(
      makeRecoveredRecord({
        repoPath: '/var/folders/demo/repo-main',
        cwd: '/var/folders/demo/repo-feature',
      })
    );

    expect(
      store.getSessions('/var/folders/demo/repo-main', '/private/var/folders/demo/repo-feature')
    ).toEqual([
      expect.objectContaining({
        id: 'session-1',
        cwd: '/var/folders/demo/repo-feature',
      }),
    ]);
  });

  it('preserves local session ui metadata when a recovered record refreshes an existing session', async () => {
    const env = await loadAgentSessionsStore();
    const store = env.useAgentSessionsStore.getState();

    store.addSession({
      id: 'session-1',
      sessionId: 'provider-local',
      name: 'Local name',
      agentId: 'codex',
      agentCommand: 'codex',
      initialized: true,
      activated: true,
      persistenceEnabled: true,
      repoPath: '/repo',
      cwd: '/repo/worktree',
      environment: 'native',
    });
    store.updateSession('session-1', {
      displayOrder: 7,
      terminalTitle: 'terminal-title',
      userRenamed: true,
      pendingCommand: 'continue work',
    });

    store.upsertRecoveredSession(
      makeRecoveredRecord({
        displayName: 'Recovered name',
        backendSessionId: 'backend-restored',
        providerSessionId: 'provider-restored',
      })
    );

    expect(env.useAgentSessionsStore.getState().sessions).toEqual([
      expect.objectContaining({
        id: 'session-1',
        sessionId: 'provider-restored',
        backendSessionId: 'backend-restored',
        name: 'Recovered name',
        displayOrder: 7,
        terminalTitle: 'terminal-title',
        userRenamed: true,
        pendingCommand: 'continue work',
        recovered: true,
        recoveryState: 'live',
      }),
    ]);
  });

  it('restores persisted group layout, enhanced input draft, and unread runtime markers', async () => {
    const persistedPayload = {
      sessions: [
        {
          id: 'session-1',
          sessionId: 'provider-1',
          name: 'Codex',
          agentId: 'codex',
          agentCommand: 'codex',
          initialized: true,
          activated: true,
          persistenceEnabled: true,
          repoPath: '/repo',
          cwd: '/repo/worktree',
          environment: 'native',
        },
        {
          id: 'session-stale',
          sessionId: 'provider-stale',
          name: 'Stale',
          agentId: 'codex',
          agentCommand: 'codex',
          initialized: true,
          activated: true,
          persistenceEnabled: false,
          repoPath: '/repo',
          cwd: '/repo/worktree',
          environment: 'native',
        },
      ],
      activeIds: {
        '/repo/worktree': 'session-1',
      },
      groupStates: {
        '/repo/worktree': {
          groups: [
            {
              id: 'group-1',
              sessionIds: ['session-1', 'session-stale'],
              activeSessionId: 'session-stale',
            },
          ],
          activeGroupId: 'group-1',
          flexPercents: [100],
        },
      },
      runtimeStates: {
        'session-1': {
          outputState: 'outputting',
          lastActivityAt: 123,
          wasActiveWhenOutputting: false,
          hasCompletedTaskUnread: true,
        },
      },
      enhancedInputStates: {
        'session-1': {
          open: true,
          content: 'Draft follow-up',
          imagePaths: ['/tmp/mock.png'],
        },
        'session-stale': {
          open: true,
          content: 'Ignore me',
          imagePaths: ['/tmp/stale.png'],
        },
      },
    };

    const env = await loadAgentSessionsStore({
      'enso-agent-sessions': JSON.stringify(persistedPayload),
    });

    const state = env.useAgentSessionsStore.getState();
    expect(state.sessions).toEqual([
      expect.objectContaining({
        id: 'session-1',
        persistenceEnabled: true,
      }),
    ]);
    expect(state.getGroupState('/repo/worktree')).toEqual({
      groups: [
        {
          id: 'group-1',
          sessionIds: ['session-1'],
          activeSessionId: 'session-1',
        },
      ],
      activeGroupId: 'group-1',
      flexPercents: [100],
    });
    expect(state.getRuntimeState('session-1')).toMatchObject({
      outputState: 'unread',
      hasCompletedTaskUnread: true,
      lastActivityAt: 123,
    });
    expect(state.getEnhancedInputState('session-1')).toEqual({
      open: true,
      content: 'Draft follow-up',
      attachments: [
        {
          id: '/tmp/mock.png',
          kind: 'image',
          name: 'mock.png',
          path: '/tmp/mock.png',
        },
      ],
    });
    expect(state.getEnhancedInputState('session-stale')).toEqual({
      open: false,
      content: '',
      attachments: [],
    });
  });

  it('persists group layout, enhanced input draft, and unread runtime markers for recoverable sessions', async () => {
    const env = await loadAgentSessionsStore();
    const store = env.useAgentSessionsStore.getState();

    store.addSession({
      id: 'session-1',
      sessionId: 'provider-1',
      name: 'Claude',
      agentId: 'claude',
      agentCommand: 'claude',
      initialized: true,
      activated: true,
      persistenceEnabled: true,
      repoPath: '/repo',
      cwd: '/repo/worktree',
      environment: 'native',
    });

    store.setGroupState('/repo/worktree', {
      groups: [
        {
          id: 'group-1',
          sessionIds: ['session-1'],
          activeSessionId: 'session-1',
        },
      ],
      activeGroupId: 'group-1',
      flexPercents: [100],
    });
    store.setEnhancedInputOpen('session-1', true);
    store.setEnhancedInputContent('session-1', 'Draft follow-up');
    store.setEnhancedInputAttachments('session-1', [
      {
        id: '/tmp/mock.png',
        kind: 'image',
        name: 'mock.png',
        path: '/tmp/mock.png',
      },
    ]);
    store.setOutputState('session-1', 'unread', false);
    store.markTaskCompletedUnread('session-1');

    const savedPayload = env.localStorageMock.setItem.mock.calls.at(-1)?.[1];
    expect(savedPayload).toBeTruthy();
    expect(JSON.parse(savedPayload as string)).toEqual(
      expect.objectContaining({
        sessions: [expect.objectContaining({ id: 'session-1' })],
        groupStates: {
          '/repo/worktree': {
            groups: [
              {
                id: 'group-1',
                sessionIds: ['session-1'],
                activeSessionId: 'session-1',
              },
            ],
            activeGroupId: 'group-1',
            flexPercents: [100],
          },
        },
        runtimeStates: {
          'session-1': expect.objectContaining({
            outputState: 'unread',
            hasCompletedTaskUnread: true,
          }),
        },
        enhancedInputStates: {
          'session-1': {
            open: true,
            content: 'Draft follow-up',
            attachments: [
              {
                id: '/tmp/mock.png',
                kind: 'image',
                name: 'mock.png',
                path: '/tmp/mock.png',
              },
            ],
          },
        },
      })
    );
  });

  it('tracks unread completed-task markers and clears them on view, worktree select, or next run', async () => {
    const env = await loadAgentSessionsStore();
    const store = env.useAgentSessionsStore.getState();

    store.addSession({
      id: 'session-1',
      sessionId: 'provider-1',
      name: 'Claude',
      agentId: 'claude',
      agentCommand: 'claude',
      initialized: true,
      activated: true,
      repoPath: '/repo',
      cwd: '/repo/worktree',
      environment: 'native',
    });

    store.markTaskCompletedUnread('session-1');
    expect(env.useAgentSessionsStore.getState().getRuntimeState('session-1')).toMatchObject({
      hasCompletedTaskUnread: true,
    });

    store.markSessionActive('session-1');
    expect(env.useAgentSessionsStore.getState().getRuntimeState('session-1')).toMatchObject({
      hasCompletedTaskUnread: false,
    });

    store.markTaskCompletedUnread('session-1');
    store.clearTaskCompletedUnreadByWorktree('/repo/worktree');
    expect(env.useAgentSessionsStore.getState().getRuntimeState('session-1')).toMatchObject({
      hasCompletedTaskUnread: false,
    });

    store.markTaskCompletedUnread('session-1');
    store.setOutputState('session-1', 'outputting', false);
    expect(env.useAgentSessionsStore.getState().getRuntimeState('session-1')).toMatchObject({
      hasCompletedTaskUnread: false,
      outputState: 'outputting',
    });
  });

  it('preserves recoverable unread runtime markers when terminal state is cleared on unmount', async () => {
    const env = await loadAgentSessionsStore();
    const store = env.useAgentSessionsStore.getState();

    store.addSession({
      id: 'session-1',
      sessionId: 'provider-1',
      name: 'Claude',
      agentId: 'claude',
      agentCommand: 'claude',
      initialized: true,
      activated: true,
      persistenceEnabled: true,
      repoPath: '/repo',
      cwd: '/repo/worktree',
      environment: 'native',
    });

    store.setOutputState('session-1', 'outputting', false);
    store.markTaskCompletedUnread('session-1');
    store.clearRuntimeState('session-1');

    expect(env.useAgentSessionsStore.getState().getRuntimeState('session-1')).toMatchObject({
      outputState: 'unread',
      hasCompletedTaskUnread: true,
    });
  });
});
