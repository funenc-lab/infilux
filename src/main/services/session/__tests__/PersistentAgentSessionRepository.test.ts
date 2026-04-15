import type { PersistentAgentSessionRecord } from '@shared/types';
import { buildAppRuntimeIdentity } from '@shared/utils/runtimeIdentity';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type SessionRow = {
  ui_session_id: string;
  backend_session_id: string | null;
  provider_session_id: string | null;
  agent_id: string;
  agent_command: string;
  custom_path: string | null;
  custom_args: string | null;
  environment: 'native' | 'hapi' | 'happy';
  repo_path: string;
  cwd: string;
  display_name: string;
  activated: number;
  initialized: number;
  host_kind: 'tmux' | 'supervisor';
  host_session_key: string;
  recovery_policy: 'auto' | 'manual' | 'metadata-only';
  created_at: number;
  updated_at: number;
  last_known_state: 'live' | 'reconnecting' | 'dead' | 'missing-host-session';
  metadata_json: string | null;
};

const repositoryTestDoubles = vi.hoisted(() => {
  class FakeDatabase {
    public configure = vi.fn();

    public run = vi.fn(
      (
        sql: string,
        params: unknown[] | ((err: Error | null) => void),
        callback?: (err: Error | null) => void
      ) => {
        const normalizedSql = sql.trim();
        const normalizedParams = Array.isArray(params) ? params : [];
        const cb = (typeof params === 'function' ? params : callback) ?? (() => {});
        state.lastRuns.push({ sql, params: normalizedParams });

        const injectedError = consumeMatchingError(state.runErrors, normalizedSql);
        if (injectedError) {
          cb(injectedError);
          return this;
        }

        if (normalizedSql.startsWith('INSERT INTO persistent_agent_sessions')) {
          const [
            uiSessionId,
            backendSessionId,
            providerSessionId,
            agentId,
            agentCommand,
            customPath,
            customArgs,
            environment,
            repoPath,
            cwd,
            displayName,
            activated,
            initialized,
            hostKind,
            hostSessionKey,
            recoveryPolicy,
            createdAt,
            updatedAt,
            lastKnownState,
            metadataJson,
          ] = normalizedParams as [
            string,
            string | null,
            string | null,
            string,
            string,
            string | null,
            string | null,
            'native' | 'hapi' | 'happy',
            string,
            string,
            string,
            number,
            number,
            'tmux' | 'supervisor',
            string,
            'auto' | 'manual' | 'metadata-only',
            number,
            number,
            'live' | 'reconnecting' | 'dead' | 'missing-host-session',
            string | null,
          ];

          state.rows = state.rows.filter((row) => row.ui_session_id !== uiSessionId);
          state.rows.push({
            ui_session_id: uiSessionId,
            backend_session_id: backendSessionId,
            provider_session_id: providerSessionId,
            agent_id: agentId,
            agent_command: agentCommand,
            custom_path: customPath,
            custom_args: customArgs,
            environment,
            repo_path: repoPath,
            cwd,
            display_name: displayName,
            activated,
            initialized,
            host_kind: hostKind,
            host_session_key: hostSessionKey,
            recovery_policy: recoveryPolicy,
            created_at: createdAt,
            updated_at: updatedAt,
            last_known_state: lastKnownState,
            metadata_json: metadataJson,
          });
          cb(null);
          return this;
        }

        if (normalizedSql.startsWith('DELETE FROM persistent_agent_sessions')) {
          const [uiSessionId] = normalizedParams as [string];
          state.rows = state.rows.filter((row) => row.ui_session_id !== uiSessionId);
          cb(null);
          return this;
        }

        cb(null);
        return this;
      }
    );

    public all = vi.fn(
      (
        sql: string,
        params: unknown[] | ((err: Error | null, rows: SessionRow[]) => void),
        callback?: (err: Error | null, rows: SessionRow[]) => void
      ) => {
        const normalizedSql = sql.trim();
        const normalizedParams = Array.isArray(params) ? params : [];
        const cb = (typeof params === 'function' ? params : callback) ?? (() => {});
        state.lastAlls.push({ sql, params: normalizedParams });

        const injectedError = consumeMatchingError(state.allErrors, normalizedSql);
        if (injectedError) {
          cb(injectedError, []);
          return this;
        }

        const rows = [...state.rows].sort((left, right) => right.updated_at - left.updated_at);
        cb(null, rows);
        return this;
      }
    );

    public exec = vi.fn((sql: string, callback?: (err: Error | null) => void) => {
      const normalizedSql = sql.trim();
      state.lastExecs.push(sql);
      callback?.(consumeMatchingError(state.execErrors, normalizedSql));
      return this;
    });

    public close = vi.fn((callback?: (err: Error | null) => void) => {
      callback?.(state.closeError);
    });
  }

  const appGetPath = vi.fn();
  const readPersistentAgentSessions = vi.fn<() => PersistentAgentSessionRecord[]>(() => []);
  const databases: FakeDatabase[] = [];
  const sqlite3 = {
    OPEN_READWRITE: 1,
    OPEN_CREATE: 2,
    Database: vi.fn(function FakeDatabaseConstructor(
      this: FakeDatabase,
      _path: string,
      _flags: number,
      callback: (err: Error | null) => void
    ) {
      const database = new FakeDatabase();
      databases.push(database);
      queueMicrotask(() => {
        callback(state.initializeError);
      });
      return database;
    }),
  };

  const state = {
    rows: [] as SessionRow[],
    lastRuns: [] as Array<{ sql: string; params: unknown[] }>,
    lastAlls: [] as Array<{ sql: string; params: unknown[] }>,
    lastExecs: [] as string[],
    runErrors: [] as Array<{ pattern: string; error: Error }>,
    allErrors: [] as Array<{ pattern: string; error: Error }>,
    execErrors: [] as Array<{ pattern: string; error: Error }>,
    initializeError: null as Error | null,
    closeError: null as Error | null,
  };

  function consumeMatchingError(
    errors: Array<{ pattern: string; error: Error }>,
    sql: string
  ): Error | null {
    const index = errors.findIndex((entry) => sql.includes(entry.pattern));
    if (index === -1) {
      return null;
    }
    return errors.splice(index, 1)[0]?.error ?? null;
  }

  function reset() {
    appGetPath.mockReset();
    appGetPath.mockImplementation((name: string) =>
      name === 'home' ? '/tmp/home' : name === 'userData' ? '/tmp/user-data' : `/tmp/${name}`
    );
    readPersistentAgentSessions.mockReset();
    readPersistentAgentSessions.mockReturnValue([]);
    sqlite3.Database.mockClear();
    databases.length = 0;
    state.rows = [];
    state.lastRuns = [];
    state.lastAlls = [];
    state.lastExecs = [];
    state.runErrors = [];
    state.allErrors = [];
    state.execErrors = [];
    state.initializeError = null;
    state.closeError = null;
  }

  return {
    appGetPath,
    readPersistentAgentSessions,
    sqlite3,
    databases,
    state,
    reset,
  };
});

const testRuntimeIdentity = buildAppRuntimeIdentity('test');

vi.mock('electron', () => ({
  app: {
    getPath: repositoryTestDoubles.appGetPath,
  },
}));

vi.mock('sqlite3', () => ({
  default: repositoryTestDoubles.sqlite3,
}));

vi.mock('../../SharedSessionState', async () => {
  const actual = await vi.importActual<typeof import('../../SharedSessionState')>(
    '../../SharedSessionState'
  );

  return {
    ...actual,
    readPersistentAgentSessions: repositoryTestDoubles.readPersistentAgentSessions,
  };
});

function makeRecord(
  overrides: Partial<PersistentAgentSessionRecord> = {}
): PersistentAgentSessionRecord {
  return {
    uiSessionId: 'session-1',
    backendSessionId: 'backend-1',
    providerSessionId: 'provider-1',
    agentId: 'claude',
    agentCommand: 'claude',
    customPath: undefined,
    customArgs: undefined,
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
    metadata: undefined,
    ...overrides,
  };
}

describe('PersistentAgentSessionRepository', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    repositoryTestDoubles.reset();
    vi.stubEnv('INFILUX_RUNTIME_CHANNEL', 'test');
    vi.stubEnv('ENSOAI_PROFILE', '');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('initializes sqlite storage and migrates legacy JSON records when the table is empty', async () => {
    vi.stubEnv('HOME', '/tmp/home');
    vi.stubEnv('USERPROFILE', '');

    repositoryTestDoubles.readPersistentAgentSessions.mockReturnValue([
      makeRecord(),
      makeRecord({
        uiSessionId: 'session-2',
        displayName: 'Cursor',
        hostKind: 'supervisor',
        hostSessionKey: 'enso-session-2',
        updatedAt: 22,
      }),
    ]);

    const { PersistentAgentSessionRepository } = await import(
      '../PersistentAgentSessionRepository'
    );
    const repository = new PersistentAgentSessionRepository();

    await repository.initialize();

    expect(repositoryTestDoubles.sqlite3.Database).toHaveBeenCalledWith(
      `/tmp/home/.infilux/${testRuntimeIdentity.persistentAgentSessionDatabaseFilename}`,
      repositoryTestDoubles.sqlite3.OPEN_READWRITE | repositoryTestDoubles.sqlite3.OPEN_CREATE,
      expect.any(Function)
    );
    expect(repositoryTestDoubles.databases[0]?.configure).toHaveBeenCalledWith('busyTimeout', 3000);
    expect(repositoryTestDoubles.databases[0]?.exec).toHaveBeenCalledTimes(1);
    expect(repository.listCachedSessions()).toEqual([
      expect.objectContaining({ uiSessionId: 'session-2' }),
      expect.objectContaining({ uiSessionId: 'session-1' }),
    ]);
  });

  it('prefers HOME overrides for the persistent session database path', async () => {
    vi.stubEnv('HOME', '/tmp/override-home');
    vi.stubEnv('USERPROFILE', '');

    const { PersistentAgentSessionRepository } = await import(
      '../PersistentAgentSessionRepository'
    );
    const repository = new PersistentAgentSessionRepository();

    await repository.initialize();

    expect(repositoryTestDoubles.sqlite3.Database).toHaveBeenCalledWith(
      `/tmp/override-home/.infilux/${testRuntimeIdentity.persistentAgentSessionDatabaseFilename}`,
      repositoryTestDoubles.sqlite3.OPEN_READWRITE | repositoryTestDoubles.sqlite3.OPEN_CREATE,
      expect.any(Function)
    );
  });

  it('isolates the persistent session database under the development shared-state profile', async () => {
    const devRuntimeIdentity = buildAppRuntimeIdentity('dev');
    vi.stubEnv('HOME', '/tmp/dev-home');
    vi.stubEnv('USERPROFILE', '');
    vi.stubEnv('INFILUX_RUNTIME_CHANNEL', 'dev');
    vi.stubEnv('ENSOAI_PROFILE', 'sessionbar dot check');

    const { PersistentAgentSessionRepository } = await import(
      '../PersistentAgentSessionRepository'
    );
    const repository = new PersistentAgentSessionRepository();

    await repository.initialize();

    expect(repositoryTestDoubles.sqlite3.Database).toHaveBeenCalledWith(
      `/tmp/dev-home/.infilux-dev/sessionbar-dot-check/${devRuntimeIdentity.persistentAgentSessionDatabaseFilename}`,
      repositoryTestDoubles.sqlite3.OPEN_READWRITE | repositoryTestDoubles.sqlite3.OPEN_CREATE,
      expect.any(Function)
    );
  });

  it('supports upsert, list, delete, and close over sqlite-backed records', async () => {
    const { PersistentAgentSessionRepository } = await import(
      '../PersistentAgentSessionRepository'
    );
    const repository = new PersistentAgentSessionRepository();
    await repository.initialize();

    await repository.upsertSession(makeRecord());
    await repository.upsertSession(
      makeRecord({
        uiSessionId: 'session-1',
        displayName: 'Claude Updated',
        updatedAt: 99,
        metadata: { retries: 2 },
      })
    );
    await repository.upsertSession(
      makeRecord({
        uiSessionId: 'session-2',
        displayName: 'Codex',
        hostSessionKey: 'enso-session-2',
        updatedAt: 120,
      })
    );

    await expect(repository.listSessions()).resolves.toEqual([
      expect.objectContaining({
        uiSessionId: 'session-2',
        displayName: 'Codex',
      }),
      expect.objectContaining({
        uiSessionId: 'session-1',
        displayName: 'Claude Updated',
        metadata: { retries: 2 },
      }),
    ]);

    await repository.deleteSession('session-2');
    expect(repository.listCachedSessions()).toEqual([
      expect.objectContaining({ uiSessionId: 'session-1' }),
    ]);

    await expect(repository.close()).resolves.toBeUndefined();
  });

  it('restores sqlite-backed persistent sessions after a repository restart', async () => {
    const { PersistentAgentSessionRepository } = await import(
      '../PersistentAgentSessionRepository'
    );

    const firstLaunchRepository = new PersistentAgentSessionRepository();
    await firstLaunchRepository.initialize();
    await firstLaunchRepository.upsertSession(
      makeRecord({
        uiSessionId: 'session-restart',
        displayName: 'Recovered After Restart',
        updatedAt: 123,
      })
    );
    await firstLaunchRepository.close();

    repositoryTestDoubles.readPersistentAgentSessions.mockReturnValue([]);

    const secondLaunchRepository = new PersistentAgentSessionRepository();
    await secondLaunchRepository.initialize();

    await expect(secondLaunchRepository.listSessions()).resolves.toEqual([
      expect.objectContaining({
        uiSessionId: 'session-restart',
        displayName: 'Recovered After Restart',
        updatedAt: 123,
      }),
    ]);
    expect(secondLaunchRepository.listCachedSessions()).toEqual([
      expect.objectContaining({
        uiSessionId: 'session-restart',
        displayName: 'Recovered After Restart',
        updatedAt: 123,
      }),
    ]);
  });

  it('prunes long-dead persistent session records during initialization', async () => {
    const staleTimestamp = Date.parse('2026-01-01T00:00:00.000Z');
    const freshTimestamp = Date.parse('2026-04-09T00:00:00.000Z');
    const dateNowSpy = vi
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse('2026-04-10T00:00:00.000Z'));

    try {
      repositoryTestDoubles.readPersistentAgentSessions.mockReturnValue([
        makeRecord({
          uiSessionId: 'stale-dead-session',
          lastKnownState: 'dead',
          updatedAt: staleTimestamp,
        }),
        makeRecord({
          uiSessionId: 'fresh-live-session',
          lastKnownState: 'live',
          updatedAt: freshTimestamp,
        }),
      ]);

      const { PersistentAgentSessionRepository } = await import(
        '../PersistentAgentSessionRepository'
      );
      const repository = new PersistentAgentSessionRepository();

      await repository.initialize();

      await expect(repository.listSessions()).resolves.toEqual([
        expect.objectContaining({
          uiSessionId: 'fresh-live-session',
        }),
      ]);
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it('surfaces open, schema, query, and close failures', async () => {
    repositoryTestDoubles.state.initializeError = new Error('open failed');
    let module = await import('../PersistentAgentSessionRepository');
    let repository = new module.PersistentAgentSessionRepository();
    await expect(repository.initialize()).rejects.toThrow('open failed');

    vi.resetModules();
    repositoryTestDoubles.reset();
    repositoryTestDoubles.state.execErrors.push({
      pattern: 'CREATE TABLE IF NOT EXISTS persistent_agent_sessions',
      error: new Error('schema failed'),
    });
    module = await import('../PersistentAgentSessionRepository');
    repository = new module.PersistentAgentSessionRepository();
    await expect(repository.initialize()).rejects.toThrow('schema failed');

    vi.resetModules();
    repositoryTestDoubles.reset();
    repositoryTestDoubles.state.allErrors.push({
      pattern: 'SELECT * FROM persistent_agent_sessions',
      error: new Error('select failed'),
    });
    module = await import('../PersistentAgentSessionRepository');
    repository = new module.PersistentAgentSessionRepository();
    await expect(repository.initialize()).rejects.toThrow('select failed');

    vi.resetModules();
    repositoryTestDoubles.reset();
    repositoryTestDoubles.state.closeError = new Error('close failed');
    module = await import('../PersistentAgentSessionRepository');
    repository = new module.PersistentAgentSessionRepository();
    await repository.initialize();
    await expect(repository.close()).rejects.toThrow('close failed');
  });
});
