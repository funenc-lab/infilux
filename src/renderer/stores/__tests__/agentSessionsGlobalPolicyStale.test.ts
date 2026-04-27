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

describe('agent session global policy stale tracking', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('marks every tracked capability session as stale when the global policy changes', async () => {
    const env = await loadAgentSessionsStore();
    const store = env.useAgentSessionsStore.getState();

    store.addSession({
      id: 'claude-1',
      sessionId: 'provider-1',
      name: 'Claude',
      agentId: 'claude',
      agentCommand: 'claude',
      initialized: true,
      activated: true,
      repoPath: '/repo-a',
      cwd: '/repo-a/worktrees/feat-a',
      environment: 'native',
      claudePolicyHash: 'hash-a',
      claudePolicyStale: false,
      agentCapabilityHash: 'hash-a',
      agentCapabilityStale: false,
    });
    store.addSession({
      id: 'claude-2',
      sessionId: 'provider-2',
      name: 'Claude',
      agentId: 'claude',
      agentCommand: 'claude',
      initialized: true,
      activated: true,
      repoPath: '/repo-b',
      cwd: '/repo-b/worktrees/feat-b',
      environment: 'native',
      claudePolicyHash: 'hash-b',
      claudePolicyStale: false,
      agentCapabilityHash: 'hash-b',
      agentCapabilityStale: false,
    });
    store.addSession({
      id: 'codex-1',
      sessionId: 'provider-3',
      name: 'Codex',
      agentId: 'codex',
      agentCommand: 'codex',
      initialized: true,
      activated: true,
      repoPath: '/repo-c',
      cwd: '/repo-c/worktrees/feat-c',
      environment: 'native',
      agentCapabilityHash: 'hash-c',
      agentCapabilityStale: false,
    });

    expect(typeof Reflect.get(store, 'markClaudePolicyStaleGlobally')).toBe('function');

    (Reflect.get(store, 'markClaudePolicyStaleGlobally') as () => void)();

    const sessions = env.useAgentSessionsStore.getState().sessions;
    expect(sessions.find((session) => session.id === 'claude-1')?.claudePolicyStale).toBe(true);
    expect(sessions.find((session) => session.id === 'claude-2')?.claudePolicyStale).toBe(true);
    expect(sessions.find((session) => session.id === 'codex-1')?.agentCapabilityStale).toBe(true);
  });
});
