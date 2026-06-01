import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@/components/chat/SessionBar';
import type { TodoTask } from '@/components/todo/types';
import { buildAgentSessionInventory } from '../agentSessionInventory';
import type { SessionRuntimeState } from '../agentSessions';

function createLocalStorageMock() {
  const data = new Map<string, string>();
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
  vi.stubGlobal('localStorage', createLocalStorageMock());
  return import('../agentSessions');
}

function session(overrides: Partial<Session> & Pick<Session, 'id'>): Session {
  const { id, ...rest } = overrides;
  return {
    id,
    name: overrides.name ?? id,
    agentId: overrides.agentId ?? 'claude',
    agentCommand: overrides.agentCommand ?? 'claude',
    initialized: overrides.initialized ?? true,
    activated: overrides.activated ?? true,
    repoPath: overrides.repoPath ?? '/repo',
    cwd: overrides.cwd ?? '/repo/worktree-a',
    environment: overrides.environment ?? 'native',
    ...rest,
  };
}

function task(overrides: Partial<TodoTask> & Pick<TodoTask, 'id'>): TodoTask {
  return {
    id: overrides.id,
    title: overrides.title ?? overrides.id,
    description: overrides.description ?? '',
    priority: overrides.priority ?? 'medium',
    status: overrides.status ?? 'in-progress',
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
    order: overrides.order ?? 0,
    agentId: overrides.agentId,
    sessionId: overrides.sessionId,
  };
}

describe('agent session inventory', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('builds normalized management rows with catalog metadata and runtime status', () => {
    const runtimeStates: Record<string, SessionRuntimeState> = {
      'session-codex': {
        outputState: 'outputting',
        lastActivityAt: 200,
        wasActiveWhenOutputting: false,
        waitingForInput: false,
        hasCompletedTaskUnread: true,
      },
      'session-cursor': {
        outputState: 'idle',
        lastActivityAt: 300,
        wasActiveWhenOutputting: false,
        waitingForInput: true,
        hasCompletedTaskUnread: false,
      },
    };

    const items = buildAgentSessionInventory({
      sessions: [
        session({
          id: 'session-codex',
          agentId: 'codex',
          agentCommand: 'codex',
          name: 'Codex work',
          persistenceEnabled: true,
          agentCapabilityStale: true,
        }),
        session({
          id: 'session-cursor',
          agentId: 'cursor-hapi',
          agentCommand: 'cursor-agent',
          cwd: '/repo/worktree-b',
          name: 'Cursor review',
        }),
      ],
      activeIds: {
        '/repo/worktree-a': 'session-codex',
      },
      runtimeStates,
    });

    expect(items).toEqual([
      expect.objectContaining({
        sessionId: 'session-cursor',
        agentFamily: 'cursor',
        agentName: 'Cursor',
        isActive: false,
        isRecoverable: false,
        isStale: false,
        lastActivityAt: 300,
        status: 'waiting-for-input',
      }),
      expect.objectContaining({
        sessionId: 'session-codex',
        agentFamily: 'codex',
        agentName: 'Codex',
        isActive: true,
        isRecoverable: true,
        isStale: true,
        lastActivityAt: 200,
        status: 'running',
        taskCompletionUnread: true,
      }),
    ]);
  });

  it('sanitizes unusable session titles in inventory rows', () => {
    const items = buildAgentSessionInventory({
      sessions: [
        session({
          id: 'session-codex',
          agentId: 'codex',
          agentCommand: 'codex',
          name: 'npm test',
        }),
      ],
      activeIds: {},
      runtimeStates: {},
    });

    expect(items).toEqual([
      expect.objectContaining({
        sessionId: 'session-codex',
        displayName: 'Codex',
      }),
    ]);
  });

  it('filters by repo and worktree while keeping dead sessions visible for cleanup', () => {
    const items = buildAgentSessionInventory({
      sessions: [
        session({
          id: 'dead',
          recoveryState: 'dead',
          repoPath: '/repo',
          cwd: '/repo/worktree-a',
        }),
        session({
          id: 'other',
          repoPath: '/other',
          cwd: '/other/worktree',
        }),
      ],
      activeIds: {},
      runtimeStates: {},
      filters: {
        repoPath: '/repo',
        cwd: '/repo/worktree-a/',
      },
    });

    expect(items).toEqual([
      expect.objectContaining({
        sessionId: 'dead',
        status: 'dead',
      }),
    ]);
  });

  it('maps persistent recovery transport states without collapsing them to idle', () => {
    const items = buildAgentSessionInventory({
      sessions: [
        session({
          id: 'session-reconnecting',
          recoveryState: 'reconnecting',
          persistenceEnabled: true,
        }),
        session({
          id: 'session-missing-host',
          recoveryState: 'missing-host-session',
          persistenceEnabled: true,
          cwd: '/repo/worktree-b',
        }),
      ],
      activeIds: {},
      runtimeStates: {},
    });

    expect(items).toEqual([
      expect.objectContaining({
        sessionId: 'session-missing-host',
        status: 'disconnected',
        isRecoverable: false,
      }),
      expect.objectContaining({
        sessionId: 'session-reconnecting',
        status: 'reconnecting',
        isRecoverable: true,
      }),
    ]);
  });

  it('attaches executing todo task summaries to session inventory rows', () => {
    const items = buildAgentSessionInventory({
      sessions: [
        session({
          id: 'session-codex',
          agentId: 'codex',
          agentCommand: 'codex',
          name: 'Codex work',
        }),
      ],
      activeIds: {},
      runtimeStates: {},
      tasks: [
        task({
          id: 'task-1',
          title: 'Fix test failure',
          priority: 'high',
          status: 'in-progress',
          sessionId: 'session-codex',
        }),
      ],
    });

    expect(items).toEqual([
      expect.objectContaining({
        sessionId: 'session-codex',
        task: {
          id: 'task-1',
          title: 'Fix test failure',
          priority: 'high',
          status: 'in-progress',
        },
      }),
    ]);
  });

  it('exposes the same inventory model through the agent sessions store', async () => {
    const { useAgentSessionsStore } = await loadAgentSessionsModule();
    const store = useAgentSessionsStore.getState();

    store.addSession(
      session({
        id: 'session-codex',
        agentId: 'codex',
        agentCommand: 'codex',
        name: 'Codex work',
      })
    );
    store.setOutputState('session-codex', 'outputting', false);

    expect(
      useAgentSessionsStore.getState().getSessionInventory({ repoPath: '/repo' }, [
        task({
          id: 'task-1',
          title: 'Fix test failure',
          sessionId: 'session-codex',
        }),
      ])
    ).toEqual([
      expect.objectContaining({
        sessionId: 'session-codex',
        agentFamily: 'codex',
        isActive: true,
        status: 'running',
        task: expect.objectContaining({ id: 'task-1' }),
      }),
    ]);
  });
});
