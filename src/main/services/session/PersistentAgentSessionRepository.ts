import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { PersistentAgentSessionRecord } from '@shared/types';
import sqlite3 from 'sqlite3';
import { getAppRuntimeIdentity } from '../../utils/runtimeIdentity';
import { getSharedRootPath, readPersistentAgentSessions } from '../SharedSessionState';

const BUSY_TIMEOUT_MS = 3000;
const STALE_PERSISTENT_SESSION_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const MAX_METADATA_BYTES = 64 * 1024;

interface PersistentAgentSessionRow {
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
}

function dbRun(database: sqlite3.Database, sql: string, params: unknown[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    database.run(sql, params, (err: Error | null) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

function dbAll<T>(database: sqlite3.Database, sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    database.all(sql, params, (err: Error | null, rows: T[]) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows ?? []);
    });
  });
}

function dbExec(database: sqlite3.Database, sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    database.exec(sql, (err: Error | null) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

function dbClose(database: sqlite3.Database): Promise<void> {
  return new Promise((resolve, reject) => {
    database.close((err: Error | null) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isOptionalString(value: unknown): value is string | null | undefined {
  return value === null || value === undefined || typeof value === 'string';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidEnvironment(value: unknown): value is PersistentAgentSessionRow['environment'] {
  return value === 'native' || value === 'hapi' || value === 'happy';
}

function isValidHostKind(value: unknown): value is PersistentAgentSessionRow['host_kind'] {
  return value === 'tmux' || value === 'supervisor';
}

function isValidRecoveryPolicy(
  value: unknown
): value is PersistentAgentSessionRow['recovery_policy'] {
  return value === 'auto' || value === 'manual' || value === 'metadata-only';
}

function isValidRuntimeState(
  value: unknown
): value is PersistentAgentSessionRow['last_known_state'] {
  return (
    value === 'live' ||
    value === 'reconnecting' ||
    value === 'dead' ||
    value === 'missing-host-session'
  );
}

function safeParseMetadata(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_METADATA_BYTES) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return isPlainObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function rowToRecord(row: PersistentAgentSessionRow): PersistentAgentSessionRecord | null {
  if (
    !isNonEmptyString(row.ui_session_id) ||
    !isOptionalString(row.backend_session_id) ||
    !isOptionalString(row.provider_session_id) ||
    !isNonEmptyString(row.agent_id) ||
    !isNonEmptyString(row.agent_command) ||
    !isOptionalString(row.custom_path) ||
    !isOptionalString(row.custom_args) ||
    !isValidEnvironment(row.environment) ||
    !isNonEmptyString(row.repo_path) ||
    !isNonEmptyString(row.cwd) ||
    !isNonEmptyString(row.display_name) ||
    !isFiniteNumber(row.activated) ||
    !isFiniteNumber(row.initialized) ||
    !isValidHostKind(row.host_kind) ||
    !isNonEmptyString(row.host_session_key) ||
    !isValidRecoveryPolicy(row.recovery_policy) ||
    !isFiniteNumber(row.created_at) ||
    !isFiniteNumber(row.updated_at) ||
    !isValidRuntimeState(row.last_known_state)
  ) {
    return null;
  }

  return {
    uiSessionId: row.ui_session_id,
    backendSessionId: row.backend_session_id ?? undefined,
    providerSessionId: row.provider_session_id ?? undefined,
    agentId: row.agent_id,
    agentCommand: row.agent_command,
    customPath: row.custom_path ?? undefined,
    customArgs: row.custom_args ?? undefined,
    environment: row.environment,
    repoPath: row.repo_path,
    cwd: row.cwd,
    displayName: row.display_name,
    activated: Boolean(row.activated),
    initialized: Boolean(row.initialized),
    hostKind: row.host_kind,
    hostSessionKey: row.host_session_key,
    recoveryPolicy: row.recovery_policy,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastKnownState: row.last_known_state,
    metadata: safeParseMetadata(row.metadata_json),
  };
}

function recordToParams(record: PersistentAgentSessionRecord): unknown[] {
  return [
    record.uiSessionId,
    record.backendSessionId ?? null,
    record.providerSessionId ?? null,
    record.agentId,
    record.agentCommand,
    record.customPath ?? null,
    record.customArgs ?? null,
    record.environment,
    record.repoPath,
    record.cwd,
    record.displayName,
    record.activated ? 1 : 0,
    record.initialized ? 1 : 0,
    record.hostKind,
    record.hostSessionKey,
    record.recoveryPolicy,
    record.createdAt,
    record.updatedAt,
    record.lastKnownState,
    record.metadata ? JSON.stringify(record.metadata) : null,
  ];
}

function cloneRecord(record: PersistentAgentSessionRecord): PersistentAgentSessionRecord {
  return {
    ...record,
    metadata: record.metadata ? { ...record.metadata } : undefined,
  };
}

function compareByUpdatedAtDesc(
  left: PersistentAgentSessionRecord,
  right: PersistentAgentSessionRecord
): number {
  return right.updatedAt - left.updatedAt;
}

function isPrunablePersistentAgentState(
  state: PersistentAgentSessionRow['last_known_state']
): boolean {
  return state === 'dead' || state === 'missing-host-session';
}

function getDatabasePath(): string {
  return join(getSharedRootPath(), getAppRuntimeIdentity().persistentAgentSessionDatabaseFilename);
}

export class PersistentAgentSessionRepository {
  private db: sqlite3.Database | null = null;
  private initializePromise: Promise<void> | null = null;
  private cache: PersistentAgentSessionRecord[] = [];

  async initialize(): Promise<void> {
    if (this.db) {
      return;
    }
    if (this.initializePromise) {
      await this.initializePromise;
      return;
    }

    this.initializePromise = this.openAndPrepare();
    try {
      await this.initializePromise;
    } finally {
      this.initializePromise = null;
    }
  }

  listCachedSessions(): PersistentAgentSessionRecord[] {
    return this.cache.map(cloneRecord);
  }

  async listSessions(): Promise<PersistentAgentSessionRecord[]> {
    await this.initialize();
    return this.listCachedSessions();
  }

  async upsertSession(record: PersistentAgentSessionRecord): Promise<void> {
    await this.initialize();
    await this.writeRecord(record);
    await this.refreshCache();
    await this.pruneStaleSessions();
    await this.refreshCache();
  }

  async deleteSession(uiSessionId: string): Promise<void> {
    await this.initialize();
    await dbRun(this.getDb(), 'DELETE FROM persistent_agent_sessions WHERE ui_session_id = ?', [
      uiSessionId,
    ]);
    this.cache = this.cache.filter((record) => record.uiSessionId !== uiSessionId);
  }

  async close(): Promise<void> {
    const database = this.db;
    if (!database) {
      return;
    }

    this.db = null;
    this.cache = [];
    await dbClose(database);
  }

  private getDb(): sqlite3.Database {
    if (!this.db) {
      throw new Error(
        '[PersistentAgentSessionRepository] Database not initialized. Call initialize() first.'
      );
    }
    return this.db;
  }

  private async openAndPrepare(): Promise<void> {
    const databasePath = getDatabasePath();
    mkdirSync(dirname(databasePath), { recursive: true });

    const database = await new Promise<sqlite3.Database>((resolve, reject) => {
      const instance = new sqlite3.Database(
        databasePath,
        sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
        (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(instance);
        }
      );
    });

    database.configure('busyTimeout', BUSY_TIMEOUT_MS);

    await dbExec(
      database,
      `
      CREATE TABLE IF NOT EXISTS persistent_agent_sessions (
        ui_session_id       TEXT PRIMARY KEY,
        backend_session_id  TEXT,
        provider_session_id TEXT,
        agent_id            TEXT NOT NULL,
        agent_command       TEXT NOT NULL,
        custom_path         TEXT,
        custom_args         TEXT,
        environment         TEXT NOT NULL,
        repo_path           TEXT NOT NULL,
        cwd                 TEXT NOT NULL,
        display_name        TEXT NOT NULL,
        activated           INTEGER NOT NULL,
        initialized         INTEGER NOT NULL,
        host_kind           TEXT NOT NULL,
        host_session_key    TEXT NOT NULL,
        recovery_policy     TEXT NOT NULL,
        created_at          INTEGER NOT NULL,
        updated_at          INTEGER NOT NULL,
        last_known_state    TEXT NOT NULL,
        metadata_json       TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_persistent_agent_sessions_worktree
        ON persistent_agent_sessions(repo_path, cwd, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_persistent_agent_sessions_host
        ON persistent_agent_sessions(host_kind, last_known_state, updated_at DESC);
      `
    );

    this.db = database;
    await this.refreshCache();
    await this.migrateLegacyStateIfNeeded();
    await this.pruneStaleSessions();
    await this.refreshCache();
  }

  private async migrateLegacyStateIfNeeded(): Promise<void> {
    if (this.cache.length > 0) {
      return;
    }

    const legacyRecords = readPersistentAgentSessions().sort(compareByUpdatedAtDesc);
    if (legacyRecords.length === 0) {
      return;
    }

    for (const record of legacyRecords) {
      await this.writeRecord(record);
    }

    await this.refreshCache();
  }

  private async refreshCache(): Promise<void> {
    const rows = await dbAll<PersistentAgentSessionRow>(
      this.getDb(),
      'SELECT * FROM persistent_agent_sessions ORDER BY updated_at DESC'
    );
    this.cache = rows.flatMap((row) => {
      const record = rowToRecord(row);
      return record ? [record] : [];
    });
  }

  private async pruneStaleSessions(now = Date.now()): Promise<void> {
    const cutoff = now - STALE_PERSISTENT_SESSION_RETENTION_MS;
    const staleSessionIds = this.cache
      .filter(
        (record) =>
          isPrunablePersistentAgentState(record.lastKnownState) && record.updatedAt < cutoff
      )
      .map((record) => record.uiSessionId);

    if (staleSessionIds.length === 0) {
      return;
    }

    await Promise.all(
      staleSessionIds.map((uiSessionId) =>
        dbRun(this.getDb(), 'DELETE FROM persistent_agent_sessions WHERE ui_session_id = ?', [
          uiSessionId,
        ])
      )
    );
  }

  private async writeRecord(record: PersistentAgentSessionRecord): Promise<void> {
    await dbRun(
      this.getDb(),
      `
      INSERT INTO persistent_agent_sessions (
        ui_session_id,
        backend_session_id,
        provider_session_id,
        agent_id,
        agent_command,
        custom_path,
        custom_args,
        environment,
        repo_path,
        cwd,
        display_name,
        activated,
        initialized,
        host_kind,
        host_session_key,
        recovery_policy,
        created_at,
        updated_at,
        last_known_state,
        metadata_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(ui_session_id) DO UPDATE SET
        backend_session_id = excluded.backend_session_id,
        provider_session_id = excluded.provider_session_id,
        agent_id = excluded.agent_id,
        agent_command = excluded.agent_command,
        custom_path = excluded.custom_path,
        custom_args = excluded.custom_args,
        environment = excluded.environment,
        repo_path = excluded.repo_path,
        cwd = excluded.cwd,
        display_name = excluded.display_name,
        activated = excluded.activated,
        initialized = excluded.initialized,
        host_kind = excluded.host_kind,
        host_session_key = excluded.host_session_key,
        recovery_policy = excluded.recovery_policy,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        last_known_state = excluded.last_known_state,
        metadata_json = excluded.metadata_json
      `,
      recordToParams(record)
    );
  }
}

export const persistentAgentSessionRepository = new PersistentAgentSessionRepository();
