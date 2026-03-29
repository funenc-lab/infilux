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

  it('persists activated non-Claude agent sessions', async () => {
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
      repoPath: '/repo',
      cwd: '/repo/worktree',
      environment: 'native',
    });

    const savedPayload = env.localStorageMock.setItem.mock.calls.at(-1)?.[1];
    expect(savedPayload).toBeTruthy();
    expect(JSON.parse(savedPayload as string).sessions).toEqual([
      expect.objectContaining({ id: 'session-1', agentCommand: 'codex' }),
    ]);
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
});
