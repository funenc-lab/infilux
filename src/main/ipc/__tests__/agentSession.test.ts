import type { PersistentAgentSessionRecord } from '@shared/types';
import { IPC_CHANNELS } from '@shared/types';
import { PERSISTENT_AGENT_REPLAY_SNAPSHOT_CHAR_LIMIT } from '@shared/utils/agentTerminalHistoryPolicy';
import {
  extractPersistentAgentReplaySnapshot,
  PERSISTENT_AGENT_SESSION_METADATA_BYTE_LIMIT,
  withPersistentAgentReplaySnapshot,
} from '@shared/utils/persistentAgentSession';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (...args: unknown[]) => unknown;

const agentSessionTestDoubles = vi.hoisted(() => {
  const handlers = new Map<string, Handler>();
  const registerMainProcessDiagnosticsCollector = vi.fn();
  const listRecoverableSessions = vi.fn();
  const restoreWorktreeSessions = vi.fn();
  const reconcileSession = vi.fn();
  const resolveProviderSession = vi.fn();
  const readProviderSessionTitle = vi.fn();
  const upsertSession = vi.fn();
  const abandonSession = vi.fn();

  function reset() {
    handlers.clear();

    registerMainProcessDiagnosticsCollector.mockReset();
    listRecoverableSessions.mockReset();
    restoreWorktreeSessions.mockReset();
    reconcileSession.mockReset();
    resolveProviderSession.mockReset();
    readProviderSessionTitle.mockReset();
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
    readProviderSessionTitle.mockResolvedValue({ title: 'Investigate provider session titles' });
    upsertSession.mockResolvedValue(undefined);
    abandonSession.mockResolvedValue([]);
  }

  return {
    handlers,
    registerMainProcessDiagnosticsCollector,
    listRecoverableSessions,
    restoreWorktreeSessions,
    reconcileSession,
    resolveProviderSession,
    readProviderSessionTitle,
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
    readProviderSessionTitle: agentSessionTestDoubles.readProviderSessionTitle,
  },
}));

vi.mock('../../utils/mainProcessDiagnostics', () => ({
  registerMainProcessDiagnosticsCollector:
    agentSessionTestDoubles.registerMainProcessDiagnosticsCollector,
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
    const readProviderSessionTitleHandler = getHandler(
      IPC_CHANNELS.AGENT_SESSION_READ_PROVIDER_TITLE
    );
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
    const titleRequest = {
      agentCommand: 'codex',
      providerSessionId: 'provider-2',
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
    expect(await readProviderSessionTitleHandler({}, titleRequest)).toEqual({
      title: 'Investigate provider session titles',
    });
    expect(await markPersistentHandler({}, record)).toBeUndefined();
    expect(await abandonHandler({}, 'session-1')).toEqual([]);

    expect(agentSessionTestDoubles.listRecoverableSessions).toHaveBeenCalledTimes(1);
    expect(agentSessionTestDoubles.restoreWorktreeSessions).toHaveBeenCalledWith(restoreRequest);
    expect(agentSessionTestDoubles.reconcileSession).toHaveBeenCalledWith('session-1');
    expect(agentSessionTestDoubles.resolveProviderSession).toHaveBeenCalledWith(resolveRequest);
    expect(agentSessionTestDoubles.readProviderSessionTitle).toHaveBeenCalledWith(titleRequest);
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

  it('accepts persistent replay snapshot metadata within the transcript recovery budget', async () => {
    const { registerAgentSessionHandlers } = await import('../agentSession');
    registerAgentSessionHandlers();

    const markPersistentHandler = getHandler(IPC_CHANNELS.AGENT_SESSION_MARK_PERSISTENT);
    const record = makeRecord({
      metadata: withPersistentAgentReplaySnapshot(
        undefined,
        'x'.repeat(PERSISTENT_AGENT_REPLAY_SNAPSHOT_CHAR_LIMIT),
        123
      ),
    });

    await expect(markPersistentHandler({}, record)).resolves.toBeUndefined();
    expect(agentSessionTestDoubles.upsertSession).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          persistentAgentSession: expect.objectContaining({
            replaySnapshot: 'x'.repeat(PERSISTENT_AGENT_REPLAY_SNAPSHOT_CHAR_LIMIT),
          }),
        }),
      })
    );
  });

  it('normalizes legacy null optional persistent record fields', async () => {
    const { registerAgentSessionHandlers } = await import('../agentSession');
    registerAgentSessionHandlers();

    const markPersistentHandler = getHandler(IPC_CHANNELS.AGENT_SESSION_MARK_PERSISTENT);
    const record = {
      ...makeRecord(),
      backendSessionId: null,
      providerSessionId: null,
      customPath: null,
      customArgs: null,
    };

    await expect(markPersistentHandler({}, record)).resolves.toBeUndefined();
    expect(agentSessionTestDoubles.upsertSession).toHaveBeenCalledWith(
      expect.not.objectContaining({
        backendSessionId: expect.anything(),
        providerSessionId: expect.anything(),
        customPath: expect.anything(),
        customArgs: expect.anything(),
      })
    );
  });

  it('normalizes oversized persistent replay metadata before upserting', async () => {
    const { registerAgentSessionHandlers } = await import('../agentSession');
    registerAgentSessionHandlers();

    const markPersistentHandler = getHandler(IPC_CHANNELS.AGENT_SESSION_MARK_PERSISTENT);
    const oversizedSnapshot = '\u001b[38;5;248m\u001b[1mx\u001b(B\u001b[m'.repeat(
      PERSISTENT_AGENT_REPLAY_SNAPSHOT_CHAR_LIMIT
    );

    await expect(
      markPersistentHandler(
        {},
        makeRecord({
          metadata: {
            persistentAgentSession: {
              replaySnapshot: oversizedSnapshot,
              replaySnapshotCapturedAt: 123,
            },
          },
        })
      )
    ).resolves.toBeUndefined();

    const upsertedRecord = agentSessionTestDoubles.upsertSession.mock.calls[0]?.[0] as
      | PersistentAgentSessionRecord
      | undefined;
    const replay = extractPersistentAgentReplaySnapshot(upsertedRecord?.metadata);
    expect(replay.replaySnapshot).toBeTruthy();
    expect(replay.replaySnapshot?.length).toBeLessThanOrEqual(
      PERSISTENT_AGENT_REPLAY_SNAPSHOT_CHAR_LIMIT
    );
    expect(JSON.stringify(upsertedRecord?.metadata).length).toBeLessThanOrEqual(
      PERSISTENT_AGENT_SESSION_METADATA_BYTE_LIMIT
    );
  });

  it('rejects malformed restore and persistent record payloads before service calls', async () => {
    const { registerAgentSessionHandlers } = await import('../agentSession');
    registerAgentSessionHandlers();

    const restoreWorktreeHandler = getHandler(IPC_CHANNELS.AGENT_SESSION_RESTORE_WORKTREE);
    const reconcileHandler = getHandler(IPC_CHANNELS.AGENT_SESSION_RECONCILE);
    const resolveProviderSessionHandler = getHandler(IPC_CHANNELS.AGENT_SESSION_RESOLVE_PROVIDER);
    const readProviderSessionTitleHandler = getHandler(
      IPC_CHANNELS.AGENT_SESSION_READ_PROVIDER_TITLE
    );
    const markPersistentHandler = getHandler(IPC_CHANNELS.AGENT_SESSION_MARK_PERSISTENT);
    const abandonHandler = getHandler(IPC_CHANNELS.AGENT_SESSION_ABANDON);

    await expect(restoreWorktreeHandler({}, { repoPath: '/repo', cwd: '' })).rejects.toThrow(
      'Invalid agent session restore request'
    );
    await expect(reconcileHandler({}, '')).rejects.toThrow('Invalid agent session id');
    await expect(
      resolveProviderSessionHandler(
        {},
        {
          agentCommand: 'codex',
          cwd: '/repo/worktree',
          createdAt: '1',
          observedAt: 2,
        }
      )
    ).rejects.toThrow('Invalid agent provider session resolve request');
    await expect(
      readProviderSessionTitleHandler({}, { agentCommand: 'codex', providerSessionId: '' })
    ).rejects.toThrow('Invalid agent provider session title request');
    await expect(
      markPersistentHandler(
        {},
        makeRecord({
          hostKind: 'socket' as never,
        })
      )
    ).rejects.toThrow('Invalid persistent agent session record');
    await expect(abandonHandler({}, 42)).rejects.toThrow('Invalid agent session id');

    expect(agentSessionTestDoubles.restoreWorktreeSessions).not.toHaveBeenCalled();
    expect(agentSessionTestDoubles.reconcileSession).not.toHaveBeenCalled();
    expect(agentSessionTestDoubles.resolveProviderSession).not.toHaveBeenCalled();
    expect(agentSessionTestDoubles.readProviderSessionTitle).not.toHaveBeenCalled();
    expect(agentSessionTestDoubles.upsertSession).not.toHaveBeenCalled();
    expect(agentSessionTestDoubles.abandonSession).not.toHaveBeenCalled();
  });

  it('tracks handler invocation counts for diagnostics collection', async () => {
    const { getAgentSessionHandlerDiagnosticsSnapshot, registerAgentSessionHandlers } =
      await import('../agentSession');
    registerAgentSessionHandlers();

    const markPersistentHandler = getHandler(IPC_CHANNELS.AGENT_SESSION_MARK_PERSISTENT);
    const listRecoverableHandler = getHandler(IPC_CHANNELS.AGENT_SESSION_LIST_RECOVERABLE);

    expect(agentSessionTestDoubles.registerMainProcessDiagnosticsCollector).toHaveBeenCalledWith(
      'agentSessionHandlers',
      expect.any(Function)
    );

    await listRecoverableHandler({});
    await markPersistentHandler({}, makeRecord({ uiSessionId: 'session-a' }));
    await markPersistentHandler({}, makeRecord({ uiSessionId: 'session-b' }));

    expect(getAgentSessionHandlerDiagnosticsSnapshot()).toEqual(
      expect.objectContaining({
        listRecoverableCalls: 1,
        markPersistentCalls: 2,
        lastMarkedPersistentSessionId: 'session-b',
      })
    );
  });
});
