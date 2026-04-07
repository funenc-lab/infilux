import type { PersistentAgentSessionRecord } from '@shared/types';
import { IPC_CHANNELS } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (...args: unknown[]) => unknown;

const agentSessionTestDoubles = vi.hoisted(() => {
  const handlers = new Map<string, Handler>();
  const listRecoverableSessions = vi.fn();
  const restoreWorktreeSessions = vi.fn();
  const reconcileSession = vi.fn();
  const resolveProviderSession = vi.fn();
  const upsertSession = vi.fn();
  const abandonSession = vi.fn();

  function reset() {
    handlers.clear();

    listRecoverableSessions.mockReset();
    restoreWorktreeSessions.mockReset();
    reconcileSession.mockReset();
    resolveProviderSession.mockReset();
    upsertSession.mockReset();
    abandonSession.mockReset();

    const record = makeRecord();
    const recoverableItem = {
      record,
      runtimeState: 'live',
      recoverable: true,
      reason: undefined,
    };

    listRecoverableSessions.mockResolvedValue([recoverableItem]);
    restoreWorktreeSessions.mockResolvedValue({ items: [recoverableItem] });
    reconcileSession.mockResolvedValue(recoverableItem);
    resolveProviderSession.mockResolvedValue({ providerSessionId: 'provider-2' });
    upsertSession.mockResolvedValue([record]);
    abandonSession.mockResolvedValue([]);
  }

  return {
    handlers,
    listRecoverableSessions,
    restoreWorktreeSessions,
    reconcileSession,
    resolveProviderSession,
    upsertSession,
    abandonSession,
    reset,
  };
});

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Handler) => {
      agentSessionTestDoubles.handlers.set(channel, handler);
    }),
  },
}));

vi.mock('../../services/session/PersistentAgentSessionService', () => ({
  persistentAgentSessionService: {
    listRecoverableSessions: agentSessionTestDoubles.listRecoverableSessions,
    restoreWorktreeSessions: agentSessionTestDoubles.restoreWorktreeSessions,
    reconcileSession: agentSessionTestDoubles.reconcileSession,
    upsertSession: agentSessionTestDoubles.upsertSession,
    abandonSession: agentSessionTestDoubles.abandonSession,
  },
}));

vi.mock('../../services/agent/AgentProviderSessionService', () => ({
  agentProviderSessionService: {
    resolveProviderSession: agentSessionTestDoubles.resolveProviderSession,
  },
}));

function makeRecord(
  overrides: Partial<PersistentAgentSessionRecord> = {}
): PersistentAgentSessionRecord {
  return {
    uiSessionId: 'session-1',
    backendSessionId: 'backend-1',
    providerSessionId: 'provider-1',
    agentId: 'claude',
    agentCommand: 'claude',
    environment: 'native',
    repoPath: '/repo',
    cwd: '/repo/worktree',
    displayName: 'Claude',
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

function getHandler(channel: string): Handler {
  const handler = agentSessionTestDoubles.handlers.get(channel);
  if (!handler) {
    throw new Error(`Missing handler for ${channel}`);
  }
  return handler;
}

describe('agentSession IPC handlers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    agentSessionTestDoubles.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('delegates all agent session handlers to the persistent session service', async () => {
    const { registerAgentSessionHandlers } = await import('../agentSession');
    registerAgentSessionHandlers();

    const listRecoverableHandler = getHandler(IPC_CHANNELS.AGENT_SESSION_LIST_RECOVERABLE);
    const restoreWorktreeHandler = getHandler(IPC_CHANNELS.AGENT_SESSION_RESTORE_WORKTREE);
    const reconcileHandler = getHandler(IPC_CHANNELS.AGENT_SESSION_RECONCILE);
    const resolveProviderSessionHandler = getHandler(IPC_CHANNELS.AGENT_SESSION_RESOLVE_PROVIDER);
    const markPersistentHandler = getHandler(IPC_CHANNELS.AGENT_SESSION_MARK_PERSISTENT);
    const abandonHandler = getHandler(IPC_CHANNELS.AGENT_SESSION_ABANDON);

    const restoreRequest = {
      repoPath: '/repo',
      cwd: '/repo/worktree',
    };
    const record = makeRecord({ uiSessionId: 'session-persist' });
    const resolveRequest = {
      agentCommand: 'codex',
      cwd: '/repo/worktree',
      createdAt: 1,
      observedAt: 2,
    };

    expect(await listRecoverableHandler({})).toEqual([
      expect.objectContaining({
        record: expect.objectContaining({ uiSessionId: 'session-1' }),
        recoverable: true,
      }),
    ]);
    expect(await restoreWorktreeHandler({}, restoreRequest)).toEqual({
      items: [
        expect.objectContaining({
          record: expect.objectContaining({ uiSessionId: 'session-1' }),
          recoverable: true,
        }),
      ],
    });
    expect(await reconcileHandler({}, 'session-1')).toEqual(
      expect.objectContaining({
        record: expect.objectContaining({ uiSessionId: 'session-1' }),
      })
    );
    expect(await resolveProviderSessionHandler({}, resolveRequest)).toEqual({
      providerSessionId: 'provider-2',
    });
    expect(await markPersistentHandler({}, record)).toEqual([
      expect.objectContaining({ uiSessionId: 'session-1' }),
    ]);
    expect(await abandonHandler({}, 'session-1')).toEqual([]);

    expect(agentSessionTestDoubles.listRecoverableSessions).toHaveBeenCalledTimes(1);
    expect(agentSessionTestDoubles.restoreWorktreeSessions).toHaveBeenCalledWith(restoreRequest);
    expect(agentSessionTestDoubles.reconcileSession).toHaveBeenCalledWith('session-1');
    expect(agentSessionTestDoubles.resolveProviderSession).toHaveBeenCalledWith(resolveRequest);
    expect(agentSessionTestDoubles.upsertSession).toHaveBeenCalledWith(record);
    expect(agentSessionTestDoubles.abandonSession).toHaveBeenCalledWith('session-1');
  });

  it('propagates restore errors so renderer can surface recovery failures', async () => {
    agentSessionTestDoubles.restoreWorktreeSessions.mockRejectedValueOnce(
      new Error('restore failed')
    );

    const { registerAgentSessionHandlers } = await import('../agentSession');
    registerAgentSessionHandlers();

    const restoreWorktreeHandler = getHandler(IPC_CHANNELS.AGENT_SESSION_RESTORE_WORKTREE);

    await expect(
      restoreWorktreeHandler({}, { repoPath: '/repo', cwd: '/repo/worktree' })
    ).rejects.toThrow('restore failed');
  });
});
