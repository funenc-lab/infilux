import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const REPOSITORY_PATH = '/repo-a';
const MAIN_WORKTREE_PATH = '/repo-a';
const FEATURE_WORKTREE_PATH = '/repo-a/.worktrees/feature';
const NORMALIZATION_REPOSITORY_PATH = '/Repo-Normalization';
const NORMALIZATION_WORKTREE_PATH = '/Repo-Normalization/.worktrees/feature';

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
      repoPath: `${NORMALIZATION_REPOSITORY_PATH}/`,
      cwd: `${NORMALIZATION_WORKTREE_PATH}/`,
      environment: 'native',
    });

    const repoPath = NORMALIZATION_REPOSITORY_PATH.toLowerCase();
    const cwd = NORMALIZATION_WORKTREE_PATH.toLowerCase();

    expect(store.getSessions(repoPath, cwd)).toEqual([
      expect.objectContaining({ id: 'session-1', agentId: 'codex' }),
    ]);
    expect(store.getActiveSessionId(repoPath, cwd)).toBe('session-1');
    expect(store.getAggregatedByRepo(repoPath)).toMatchObject({ total: 1 });
  });

  it('does not select an active session from another worktree in the same repository', async () => {
    const env = await loadAgentSessionsStore();
    const store = env.useAgentSessionsStore.getState();

    store.addSession({
      id: 'main-worktree-session',
      sessionId: 'provider-main',
      name: 'Main Worktree',
      agentId: 'codex',
      agentCommand: 'codex',
      initialized: true,
      activated: true,
      repoPath: REPOSITORY_PATH,
      cwd: MAIN_WORKTREE_PATH,
      environment: 'native',
    });
    store.addSession({
      id: 'feature-worktree-session',
      sessionId: 'provider-feature',
      name: 'Feature Worktree',
      agentId: 'codex',
      agentCommand: 'codex',
      initialized: true,
      activated: true,
      repoPath: REPOSITORY_PATH,
      cwd: FEATURE_WORKTREE_PATH,
      environment: 'native',
    });

    store.setActiveId(MAIN_WORKTREE_PATH, 'feature-worktree-session');

    expect(store.getActiveSessionId(REPOSITORY_PATH, MAIN_WORKTREE_PATH)).toBe(
      'main-worktree-session'
    );
  });
});
