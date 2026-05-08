import type { PersistentAgentSessionRecord } from '@shared/types';
import { toRemoteVirtualPath } from '@shared/utils/remotePath';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistentSessionHost } from '../SessionHost';

const persistentAgentSessionServiceTestDoubles = vi.hoisted(() => {
  const listSessions = vi.fn<() => Promise<PersistentAgentSessionRecord[]>>(async () => []);
  const upsertSession = vi.fn<(record: PersistentAgentSessionRecord) => Promise<void>>(
    async (_record) => undefined
  );
  const deleteSession = vi.fn<(uiSessionId: string) => Promise<void>>(async (uiSessionId) => {
    void uiSessionId;
  });
  const listCachedSessions = vi.fn<() => PersistentAgentSessionRecord[]>(() => []);
  const requestMainProcessDiagnosticsCapture = vi.fn(() => 'diag-persistent-session');

  return {
    listSessions,
    upsertSession,
    deleteSession,
    listCachedSessions,
    requestMainProcessDiagnosticsCapture,
  };
});

vi.mock('../PersistentAgentSessionRepository', () => ({
  persistentAgentSessionRepository: {
    listSessions: persistentAgentSessionServiceTestDoubles.listSessions,
    upsertSession: persistentAgentSessionServiceTestDoubles.upsertSession,
    deleteSession: persistentAgentSessionServiceTestDoubles.deleteSession,
    listCachedSessions: persistentAgentSessionServiceTestDoubles.listCachedSessions,
  },
}));

vi.mock('../../../utils/mainProcessDiagnostics', () => ({
  requestMainProcessDiagnosticsCapture:
    persistentAgentSessionServiceTestDoubles.requestMainProcessDiagnosticsCapture,
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
    persistentAgentSessionServiceTestDoubles.listCachedSessions.mockReturnValue([]);
    persistentAgentSessionServiceTestDoubles.requestMainProcessDiagnosticsCapture.mockReset();
    persistentAgentSessionServiceTestDoubles.requestMainProcessDiagnosticsCapture.mockReturnValue(
      'diag-persistent-session'
    );
  });

  it('upserts persistent session records by ui session id', async () => {
    const service = new PersistentAgentSessionService();
    const record = makeRecord({
      uiSessionId: 'session-1',
      displayName: 'Claude Updated',
      updatedAt: 22,
    });

    await service.upsertSession(record);

    expect(persistentAgentSessionServiceTestDoubles.upsertSession).toHaveBeenCalledWith(record);
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

  it('prefers recoverable duplicate provider sessions over newer metadata-only recovery records', async () => {
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

  it('reconciles host state and returns missing tmux sessions for metadata recovery', async () => {
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
        recoverable: false,
        reason: 'missing-host-session',
      }),
    ]);
    expect(persistentAgentSessionServiceTestDoubles.deleteSession).not.toHaveBeenCalled();
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

    await service.restoreWorktreeSessions({
      repoPath: '/repo',
      cwd: '/repo/worktree',
    });

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
    persistentAgentSessionServiceTestDoubles.listSessions.mockResolvedValue([makeRecord()]);
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
});
