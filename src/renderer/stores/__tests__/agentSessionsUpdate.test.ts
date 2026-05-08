import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@/components/chat/SessionBar';

function createLocalStorageMock() {
  const data = new Map<string, string>();
  return {
    data,
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
  vi.stubGlobal('navigator', { platform: 'MacIntel' });
  const module = await import('../agentSessions');
  return {
    ...module,
    localStorageMock,
  };
}

function createSession(overrides: Partial<Session> & Pick<Session, 'id'>): Session {
  const { id, ...rest } = overrides;
  return {
    id,
    name: overrides.name ?? id,
    agentId: overrides.agentId ?? 'claude',
    agentCommand: overrides.agentCommand ?? 'claude',
    initialized: overrides.initialized ?? true,
    activated: overrides.activated ?? true,
    persistenceEnabled: overrides.persistenceEnabled ?? true,
    repoPath: overrides.repoPath ?? '/repo',
    cwd: overrides.cwd ?? '/repo/worktree-a',
    environment: overrides.environment ?? 'native',
    ...rest,
  };
}

describe('agent session updates', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('does not replace the sessions collection when an update has no value changes', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { useAgentSessionsStore } = await loadAgentSessionsModule();

    useAgentSessionsStore.getState().addSession(createSession({ id: 'session-1' }));
    const beforeSessions = useAgentSessionsStore.getState().sessions;

    useAgentSessionsStore.getState().updateSession('session-1', { name: 'session-1' });

    expect(useAgentSessionsStore.getState().sessions).toBe(beforeSessions);
  });

  it('replaces the target session when an update changes a value', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { useAgentSessionsStore } = await loadAgentSessionsModule();

    useAgentSessionsStore.getState().addSession(createSession({ id: 'session-1' }));
    const beforeSessions = useAgentSessionsStore.getState().sessions;

    useAgentSessionsStore.getState().updateSession('session-1', { recoveryState: 'live' });

    expect(useAgentSessionsStore.getState().sessions).not.toBe(beforeSessions);
    expect(useAgentSessionsStore.getState().sessions[0]?.recoveryState).toBe('live');
  });

  it('batches session persistence instead of synchronously writing each runtime update', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { flushPendingAgentSessionsStorageSave, localStorageMock, useAgentSessionsStore } =
      await loadAgentSessionsModule();
    const store = useAgentSessionsStore.getState();

    store.addSession(createSession({ id: 'session-1' }));
    store.setOutputState('session-1', 'outputting', false);
    store.setWaitingForInput('session-1', true);

    expect(localStorageMock.data.get('enso-agent-sessions')).toBeUndefined();
    const callsBeforeFlush = localStorageMock.setItem.mock.calls.length;

    flushPendingAgentSessionsStorageSave();

    expect(localStorageMock.setItem.mock.calls.length).toBe(callsBeforeFlush + 1);
    expect(localStorageMock.data.get('enso-agent-sessions')).toEqual(
      expect.stringContaining('session-1')
    );

    vi.useRealTimers();
  });
});
