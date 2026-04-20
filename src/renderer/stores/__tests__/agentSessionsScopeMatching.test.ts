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
  vi.stubGlobal('navigator', { platform: 'MacIntel' });
  const module = await import('../agentSessions');
  return {
    useAgentSessionsStore: module.useAgentSessionsStore,
    localStorageMock,
  };
}

describe('agent session scope matching in store selectors', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns sessions and active ids when the repo path uses an equivalent representation', async () => {
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
      repoPath: '/Users/tanzv/Development/Git/Lads-Gateway/',
      cwd: '/Users/tanzv/Development/Git/Lads-Gateway/worktrees/feat-skill-mcp/',
      environment: 'native',
    });

    const repoPath = '/users/tanzv/development/git/lads-gateway';
    const cwd = '/users/tanzv/development/git/lads-gateway/worktrees/feat-skill-mcp';

    expect(store.getSessions(repoPath, cwd)).toEqual([
      expect.objectContaining({ id: 'session-1', agentId: 'codex' }),
    ]);
    expect(store.getActiveSessionId(repoPath, cwd)).toBe('session-1');
    expect(store.getAggregatedByRepo(repoPath)).toMatchObject({ total: 1 });
  });
});
