import type { PersistentAgentSessionRecord } from '@shared/types';
import { toRemoteVirtualPath } from '@shared/utils/remotePath';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistentSessionHost } from '../SessionHost';

const persistentAgentSessionServiceTestDoubles = vi.hoisted(() => {
  const listSessions = vi.fn<() => Promise<PersistentAgentSessionRecord[]>>(async () => []);
  const getSession = vi.fn<
    (uiSessionId: string) => Promise<PersistentAgentSessionRecord | undefined>
  >(async (_uiSessionId) => undefined);
  const upsertSession = vi.fn<(record: PersistentAgentSessionRecord) => Promise<void>>(
    async (_record) => undefined
  );
  const deleteSession = vi.fn<(uiSessionId: string) => Promise<void>>(async (uiSessionId) => {
    void uiSessionId;
  });
  const listCachedSessions = vi.fn<() => PersistentAgentSessionRecord[]>(() => []);
  const requestMainProcessDiagnosticsCapture = vi.fn(() => 'diag-persistent-session');
  const deleteTranscriptArchive = vi.fn(async (_sessionId: string) => undefined);

  return {
    listSessions,
    getSession,
    upsertSession,
    deleteSession,
    listCachedSessions,
    requestMainProcessDiagnosticsCapture,
    deleteTranscriptArchive,
  };
});

vi.mock('../PersistentAgentSessionRepository', () => ({
  persistentAgentSessionRepository: {
    listSessions: persistentAgentSessionServiceTestDoubles.listSessions,
    getSession: persistentAgentSessionServiceTestDoubles.getSession,
    upsertSession: persistentAgentSessionServiceTestDoubles.upsertSession,
    deleteSession: persistentAgentSessionServiceTestDoubles.deleteSession,
    listCachedSessions: persistentAgentSessionServiceTestDoubles.listCachedSessions,
  },
}));

vi.mock('../../../utils/mainProcessDiagnostics', () => ({
  requestMainProcessDiagnosticsCapture:
    persistentAgentSessionServiceTestDoubles.requestMainProcessDiagnosticsCapture,
}));

vi.mock('../SessionTranscriptArchive', () => ({
  sessionTranscriptArchive: {
    delete: persistentAgentSessionServiceTestDoubles.deleteTranscriptArchive,
  },
}));

import { PersistentAgentSessionService } from '../PersistentAgentSessionService';

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
    createdAt: 10,
    updatedAt: 11,
    lastKnownState: 'live',
    ...overrides,
  };
}

describe('PersistentAgentSessionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistentAgentSessionServiceTestDoubles.listSessions.mockResolvedValue([]);
    persistentAgentSessionServiceTestDoubles.getSession.mockResolvedValue(undefined);
    persistentAgentSessionServiceTestDoubles.listCachedSessions.mockReturnValue([]);
    persistentAgentSessionServiceTestDoubles.requestMainProcessDiagnosticsCapture.mockReset();
    persistentAgentSessionServiceTestDoubles.requestMainProcessDiagnosticsCapture.mockReturnValue(
      'diag-persistent-session'
    );
    persistentAgentSessionServiceTestDoubles.deleteTranscriptArchive.mockReset();
    persistentAgentSessionServiceTestDoubles.deleteTranscriptArchive.mockResolvedValue(undefined);
  });

  it('upserts persistent session records without probing the host', async () => {
    const host: PersistentSessionHost = {
      kind: 'tmux',
      probeSession: vi.fn(async (record) => record.lastKnownState),
    };
    const service = new PersistentAgentSessionService(undefined, () => host);
    const record = makeRecord({
      uiSessionId: 'session-1',
      displayName: 'Claude Updated',
      updatedAt: 22,
    });

    await service.upsertSession(record);

    expect(persistentAgentSessionServiceTestDoubles.upsertSession).toHaveBeenCalledWith(record);
    expect(host.probeSession).not.toHaveBeenCalled();
  });

  it('preserves authoritative dead state when host identity is unchanged', async () => {
    const existingRecord = makeRecord({
      uiSessionId: 'session-1',
      lastKnownState: 'dead',
    });
    persistentAgentSessionServiceTestDoubles.getSession.mockResolvedValue(existingRecord);
    const record = makeRecord({ displayName: 'Claude Updated', updatedAt: 22 });
    const probeSession = vi.fn(async () => 'live' as const);
    const host: PersistentSessionHost = {
      kind: 'tmux',
      probeSession,
    };
    const service = new PersistentAgentSessionService(undefined, () => host);

    await service.upsertSession(record);

    expect(probeSession).not.toHaveBeenCalled();
    expect(persistentAgentSessionServiceTestDoubles.upsertSession).toHaveBeenCalledWith(
      expect.objectContaining({
        uiSessionId: 'session-1',
        displayName: 'Claude Updated',
        lastKnownState: 'dead',
      })
    );
  });

  it('preserves authoritative missing host state when host identity is unchanged', async () => {
    persistentAgentSessionServiceTestDoubles.getSession.mockResolvedValue(
      makeRecord({ lastKnownState: 'missing-host-session' })
    );
    const service = new PersistentAgentSessionService();

    await service.upsertSession(makeRecord({ displayName: 'Claude Updated', updatedAt: 22 }));

    expect(persistentAgentSessionServiceTestDoubles.upsertSession).toHaveBeenCalledWith(
      expect.objectContaining({ lastKnownState: 'missing-host-session' })
    );
  });

  it('accepts incoming state when the persisted host identity changed', async () => {
    persistentAgentSessionServiceTestDoubles.getSession.mockResolvedValue(
      makeRecord({ lastKnownState: 'dead', hostSessionKey: 'previous-host' })
    );
    const service = new PersistentAgentSessionService();

    await service.upsertSession(makeRecord({ hostSessionKey: 'replacement-host' }));

    expect(persistentAgentSessionServiceTestDoubles.upsertSession).toHaveBeenCalledWith(
      expect.objectContaining({ hostSessionKey: 'replacement-host', lastKnownState: 'live' })
    );
  });

  it('restores worktree sessions and preserves non-recoverable records for metadata recovery', async () => {
    persistentAgentSessionServiceTestDoubles.listSessions.mockResolvedValue([
      makeRecord(),
      makeRecord({
        uiSessionId: 'session-2',
        repoPath: '/repo',
        cwd: '/repo/worktree',
        displayName: 'Dead Session',
        lastKnownState: 'dead',
      }),
      makeRecord({
        uiSessionId: 'session-3',
        repoPath: '/other',
        cwd: '/other/worktree',
      }),
    ]);
    const host: PersistentSessionHost = {
      kind: 'tmux',
      probeSession: vi.fn(async (record) => record.lastKnownState),
    };
    const service = new PersistentAgentSessionService(undefined, () => host);

    const result = await service.restoreWorktreeSessions({
      repoPath: '/repo',
      cwd: '/repo/worktree',
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        record: expect.objectContaining({ uiSessionId: 'session-1' }),
        runtimeState: 'live',
        recoverable: true,
      }),
      expect.objectContaining({
        record: expect.objectContaining({ uiSessionId: 'session-2' }),
        runtimeState: 'dead',
        recoverable: false,
        reason: 'session-dead',
      }),
    ]);
    expect(persistentAgentSessionServiceTestDoubles.deleteSession).not.toHaveBeenCalled();
  });

  it('only probes records that match the requested worktree during restore', async () => {
    persistentAgentSessionServiceTestDoubles.listSessions.mockResolvedValue([
      makeRecord({
        uiSessionId: 'session-1',
        repoPath: '/repo',
        cwd: '/repo/worktree',
      }),
      makeRecord({
        uiSessionId: 'session-2',
        repoPath: '/repo',
        cwd: '/repo/other-worktree',
        hostSessionKey: 'enso-session-2',
      }),
      makeRecord({
        uiSessionId: 'session-3',
        repoPath: '/another-repo',
        cwd: '/another-repo/worktree',
        hostSessionKey: 'enso-session-3',
      }),
    ]);
    const probeSession = vi.fn(
      async (record: PersistentAgentSessionRecord) => record.lastKnownState
    );
    const host: PersistentSessionHost = {
      kind: 'tmux',
      probeSession,
    };
    const service = new PersistentAgentSessionService(undefined, () => host);

    const result = await service.restoreWorktreeSessions({
      repoPath: '/repo',
      cwd: '/repo/worktree',
    });

    expect(probeSession).toHaveBeenCalledTimes(1);
    expect(probeSession).toHaveBeenCalledWith(
      expect.objectContaining({
        uiSessionId: 'session-1',
        repoPath: '/repo',
        cwd: '/repo/worktree',
      })
    );
    expect(result.items).toEqual([
      expect.objectContaining({
        record: expect.objectContaining({ uiSessionId: 'session-1' }),
        runtimeState: 'live',
        recoverable: true,
      }),
    ]);
  });

  it('backfills a missing Codex provider session identity during worktree recovery', async () => {
    const record = makeRecord({
      agentId: 'codex',
      agentCommand: 'codex',
      providerSessionId: undefined,
      uiSessionId: 'codex-session-1',
      hostSessionKey: 'infilux-codex-session-1',
      createdAt: 100,
      updatedAt: 110,
    });
    persistentAgentSessionServiceTestDoubles.listSessions.mockResolvedValue([record]);
    const host: PersistentSessionHost = {
      kind: 'tmux',
      probeSession: vi.fn(async (entry) => entry.lastKnownState),
    };
    const resolveProviderSession = vi.fn(async () => ({
      providerSessionId: 'codex-provider-1',
    }));
    const now = vi.spyOn(Date, 'now').mockReturnValue(200);
    const service = new PersistentAgentSessionService(
      undefined,
      () => host,
      undefined,
      resolveProviderSession
    );

    const result = await service.restoreWorktreeSessions({
      repoPath: '/repo',
      cwd: '/repo/worktree',
    });

    expect(resolveProviderSession).toHaveBeenCalledWith({
      agentCommand: 'codex',
      uiSessionId: 'codex-session-1',
      cwd: '/repo/worktree',
      createdAt: 100,
      observedAt: 200,
    });
    expect(persistentAgentSessionServiceTestDoubles.upsertSession).toHaveBeenCalledWith(
      expect.objectContaining({
        uiSessionId: 'codex-session-1',
        providerSessionId: 'codex-provider-1',
        updatedAt: 200,
      })
    );
    expect(result.items[0]?.record).toEqual(
      expect.objectContaining({ providerSessionId: 'codex-provider-1' })
    );

    now.mockRestore();
  });

  it('deduplicates restored worktree sessions that resolve to the same provider session id', async () => {
    persistentAgentSessionServiceTestDoubles.listSessions.mockResolvedValue([
      makeRecord({
        uiSessionId: 'session-new',
        providerSessionId: 'provider-shared',
        hostSessionKey: 'enso-session-new',
        updatedAt: 30,
      }),
      makeRecord({
        uiSessionId: 'session-other',
        providerSessionId: 'provider-other',
        hostSessionKey: 'enso-session-other',
        updatedAt: 25,
      }),
      makeRecord({
        uiSessionId: 'session-old',
        providerSessionId: 'provider-shared',
        hostSessionKey: 'enso-session-old',
        updatedAt: 20,
      }),
    ]);
    const host: PersistentSessionHost = {
      kind: 'tmux',
      probeSession: vi.fn(async (record) => record.lastKnownState),
    };
    const service = new PersistentAgentSessionService(undefined, () => host);

    const result = await service.restoreWorktreeSessions({
      repoPath: '/repo',
      cwd: '/repo/worktree',
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        record: expect.objectContaining({
          uiSessionId: 'session-new',
          providerSessionId: 'provider-shared',
        }),
        runtimeState: 'live',
        recoverable: true,
      }),
      expect.objectContaining({
        record: expect.objectContaining({
          uiSessionId: 'session-other',
          providerSessionId: 'provider-other',
        }),
        runtimeState: 'live',
        recoverable: true,
      }),
    ]);
  });

  it('prefers an available host over a newer provider-resumable record', async () => {
    persistentAgentSessionServiceTestDoubles.listSessions.mockResolvedValue([
      makeRecord({
        uiSessionId: 'session-missing',
        providerSessionId: 'provider-shared',
        hostSessionKey: 'enso-session-missing',
        updatedAt: 30,
        lastKnownState: 'missing-host-session',
      }),
      makeRecord({
        uiSessionId: 'session-live',
        providerSessionId: 'provider-shared',
        hostSessionKey: 'enso-session-live',
        updatedAt: 20,
        lastKnownState: 'live',
      }),
    ]);
    const host: PersistentSessionHost = {
      kind: 'tmux',
      probeSession: vi.fn(async (record) => record.lastKnownState),
    };
    const service = new PersistentAgentSessionService(undefined, () => host);

    const result = await service.restoreWorktreeSessions({
      repoPath: '/repo',
      cwd: '/repo/worktree',
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        record: expect.objectContaining({
          uiSessionId: 'session-live',
          providerSessionId: 'provider-shared',
        }),
        runtimeState: 'live',
        recoverable: true,
      }),
    ]);
  });

  it('reconciles a missing tmux host into a recoverable provider session', async () => {
    persistentAgentSessionServiceTestDoubles.listSessions.mockResolvedValue([makeRecord()]);
    const probeSession = vi.fn<() => Promise<'live' | 'missing-host-session'>>(
      async () => 'missing-host-session'
    );
    const host: PersistentSessionHost = {
      kind: 'tmux',
      probeSession,
    };
    const service = new PersistentAgentSessionService(undefined, () => host);

    const result = await service.restoreWorktreeSessions({
      repoPath: '/repo',
      cwd: '/repo/worktree',
    });

    expect(probeSession).toHaveBeenCalledWith(
      expect.objectContaining({ uiSessionId: 'session-1' })
    );
    expect(persistentAgentSessionServiceTestDoubles.upsertSession).toHaveBeenCalledWith(
      expect.objectContaining({
        uiSessionId: 'session-1',
        lastKnownState: 'missing-host-session',
      })
    );
    expect(result.items).toEqual([
      expect.objectContaining({
        record: expect.objectContaining({
          uiSessionId: 'session-1',
          lastKnownState: 'missing-host-session',
        }),
        runtimeState: 'missing-host-session',
        recoverable: true,
        reason: 'missing-host-session',
      }),
    ]);
    expect(persistentAgentSessionServiceTestDoubles.deleteSession).not.toHaveBeenCalled();
  });

  it('keeps missing host sessions metadata-only when their agent cannot resume provider sessions', async () => {
    persistentAgentSessionServiceTestDoubles.listSessions.mockResolvedValue([
      makeRecord({ agentId: 'gemini', agentCommand: 'gemini' }),
    ]);
    const host: PersistentSessionHost = {
      kind: 'tmux',
      probeSession: vi.fn(async () => 'missing-host-session' as const),
    };
    const service = new PersistentAgentSessionService(undefined, () => host);

    const result = await service.restoreWorktreeSessions({
      repoPath: '/repo',
      cwd: '/repo/worktree',
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        record: expect.objectContaining({ agentCommand: 'gemini' }),
        runtimeState: 'missing-host-session',
        recoverable: false,
      }),
    ]);
  });

  it('captures diagnostics when tmux recovery falls back to metadata-only recovery without a provider session id', async () => {
    persistentAgentSessionServiceTestDoubles.listSessions.mockResolvedValue([
      makeRecord({
        agentId: 'codex',
        agentCommand: 'codex',
        uiSessionId: 'session-1',
        providerSessionId: 'session-1',
      }),
    ]);
    const probeSession = vi.fn<() => Promise<'missing-host-session'>>(
      async () => 'missing-host-session'
    );
    const host: PersistentSessionHost = {
      kind: 'tmux',
      probeSession,
    };
    const service = new PersistentAgentSessionService(undefined, () => host);

    const result = await service.restoreWorktreeSessions({
      repoPath: '/repo',
      cwd: '/repo/worktree',
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        runtimeState: 'missing-host-session',
        recoverable: false,
      }),
    ]);

    expect(
      persistentAgentSessionServiceTestDoubles.requestMainProcessDiagnosticsCapture
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'persistent-agent-session-recovery-provider-unresolved',
        level: 'warn',
        context: expect.objectContaining({
          uiSessionId: 'session-1',
          providerSessionId: 'session-1',
          hostSessionKey: 'enso-session-1',
        }),
      })
    );
  });

  it('treats a tmux host session key stored as provider id as unresolved provider identity', async () => {
    persistentAgentSessionServiceTestDoubles.listSessions.mockResolvedValue([
      makeRecord({
        agentId: 'codex',
        agentCommand: 'codex',
        uiSessionId: 'session-1',
        providerSessionId: 'enso-session-1',
        hostSessionKey: 'enso-session-1',
      }),
    ]);
    const probeSession = vi.fn<() => Promise<'missing-host-session'>>(
      async () => 'missing-host-session'
    );
    const host: PersistentSessionHost = {
      kind: 'tmux',
      probeSession,
    };
    const service = new PersistentAgentSessionService(undefined, () => host);

    await service.restoreWorktreeSessions({
      repoPath: '/repo',
      cwd: '/repo/worktree',
    });

    expect(
      persistentAgentSessionServiceTestDoubles.requestMainProcessDiagnosticsCapture
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'persistent-agent-session-recovery-provider-unresolved',
        context: expect.objectContaining({
          uiSessionId: 'session-1',
          providerSessionId: 'enso-session-1',
          hostSessionKey: 'enso-session-1',
        }),
      })
    );
  });

  it('ignores remote virtual-path records during worktree restore', async () => {
    persistentAgentSessionServiceTestDoubles.listSessions.mockResolvedValue([
      makeRecord({
        uiSessionId: 'remote-session-1',
        repoPath: '/repo',
        cwd: toRemoteVirtualPath('conn-1', '/repo/worktree'),
        hostKind: 'tmux',
        hostSessionKey: 'enso-remote-session-1',
      }),
    ]);
    const probeSession = vi.fn(
      async (record: PersistentAgentSessionRecord) => record.lastKnownState
    );
    const host: PersistentSessionHost = {
      kind: 'tmux',
      probeSession,
    };
    const service = new PersistentAgentSessionService(undefined, () => host);

    const result = await service.restoreWorktreeSessions({
      repoPath: '/repo',
      cwd: toRemoteVirtualPath('conn-1', '/repo/worktree'),
    });

    expect(result.items).toEqual([]);
    expect(probeSession).not.toHaveBeenCalled();
  });

  it('reconcileSession preserves live records when the host probe succeeds', async () => {
    persistentAgentSessionServiceTestDoubles.getSession.mockResolvedValue(makeRecord());
    const probeSession = vi.fn<() => Promise<'live'>>(async () => 'live');
    const host: PersistentSessionHost = {
      kind: 'tmux',
      probeSession,
    };
    const service = new PersistentAgentSessionService(undefined, () => host);

    const result = await service.reconcileSession('session-1');

    expect(result).toEqual(
      expect.objectContaining({
        record: expect.objectContaining({
          uiSessionId: 'session-1',
          lastKnownState: 'live',
        }),
        runtimeState: 'live',
        recoverable: true,
      })
    );
    expect(persistentAgentSessionServiceTestDoubles.upsertSession).not.toHaveBeenCalled();
    expect(persistentAgentSessionServiceTestDoubles.listSessions).not.toHaveBeenCalled();
  });

  it('matches local worktree paths after normalization on case-insensitive platforms', async () => {
    persistentAgentSessionServiceTestDoubles.listSessions.mockResolvedValue([
      makeRecord({
        uiSessionId: 'session-1',
        repoPath: '/Repo',
        cwd: '/Repo/Worktree/',
      }),
    ]);
    const host: PersistentSessionHost = {
      kind: 'tmux',
      probeSession: vi.fn(async (record) => record.lastKnownState),
    };
    const service = new PersistentAgentSessionService(undefined, () => host);
    const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');

    try {
      const result = await service.restoreWorktreeSessions({
        repoPath: '/repo/',
        cwd: '/repo/worktree',
      });

      expect(result.items).toEqual([
        expect.objectContaining({
          record: expect.objectContaining({ uiSessionId: 'session-1' }),
          recoverable: true,
        }),
      ]);
    } finally {
      platform.mockRestore();
    }
  });

  it('matches darwin worktree paths across /var and /private/var aliases', async () => {
    persistentAgentSessionServiceTestDoubles.listSessions.mockResolvedValue([
      makeRecord({
        uiSessionId: 'session-1',
        repoPath: '/var/folders/demo/repo-main',
        cwd: '/var/folders/demo/repo-feature',
      }),
    ]);
    const host: PersistentSessionHost = {
      kind: 'tmux',
      probeSession: vi.fn(async (record) => record.lastKnownState),
    };
    const service = new PersistentAgentSessionService(undefined, () => host);
    const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');

    try {
      const result = await service.restoreWorktreeSessions({
        repoPath: '/private/var/folders/demo/repo-main',
        cwd: '/private/var/folders/demo/repo-feature',
      });

      expect(result.items).toEqual([
        expect.objectContaining({
          record: expect.objectContaining({ uiSessionId: 'session-1' }),
          recoverable: true,
        }),
      ]);
    } finally {
      platform.mockRestore();
    }
  });

  it('abandons persistent sessions by ui session id and exposes cached sessions synchronously', async () => {
    persistentAgentSessionServiceTestDoubles.listCachedSessions.mockReturnValue([
      makeRecord(),
      makeRecord({ uiSessionId: 'session-2', hostSessionKey: 'enso-session-2' }),
    ]);
    const service = new PersistentAgentSessionService();

    await service.abandonSession('session-1');

    expect(persistentAgentSessionServiceTestDoubles.deleteSession).toHaveBeenCalledWith(
      'session-1'
    );
    expect(service.listCachedSessionsSync()).toEqual([
      expect.objectContaining({ uiSessionId: 'session-1' }),
      expect.objectContaining({ uiSessionId: 'session-2' }),
    ]);
  });

  it('deletes a persistent session transcript before removing its record', async () => {
    const record = makeRecord({ backendSessionId: 'backend-transcript-1' });
    const deleteTranscript = vi.fn(async (_record: PersistentAgentSessionRecord) => undefined);
    persistentAgentSessionServiceTestDoubles.getSession.mockResolvedValue(record);
    const service = new PersistentAgentSessionService(undefined, undefined, deleteTranscript);

    await service.abandonSession(record.uiSessionId);

    expect(deleteTranscript).toHaveBeenCalledWith(record);
    expect(persistentAgentSessionServiceTestDoubles.deleteSession).toHaveBeenCalledWith(
      record.uiSessionId
    );
    expect(deleteTranscript.mock.invocationCallOrder[0]).toBeLessThan(
      persistentAgentSessionServiceTestDoubles.deleteSession.mock.invocationCallOrder[0] ?? Infinity
    );
  });

  it('deletes local PTY transcripts by stable UI session identity', async () => {
    const record = makeRecord({
      uiSessionId: 'agent-ui-session-1',
      backendSessionId: 'backend-transcript-1',
    });
    persistentAgentSessionServiceTestDoubles.getSession.mockResolvedValue(record);
    const service = new PersistentAgentSessionService();

    await service.abandonSession(record.uiSessionId);

    expect(persistentAgentSessionServiceTestDoubles.deleteTranscriptArchive).toHaveBeenCalledWith(
      'agent-ui-session-1'
    );
  });
});
