import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { PersistentAgentSessionRecord } from '@shared/types';
import {
  normalizePersistentAgentSessionMetadata,
  PERSISTENT_AGENT_SESSION_METADATA_BYTE_LIMIT,
} from '@shared/utils/persistentAgentSession';
import sqlite3 from 'sqlite3';
import log from '../../utils/logger';
import { registerMainProcessDiagnosticsCollector } from '../../utils/mainProcessDiagnostics';
import { getAppRuntimeIdentity } from '../../utils/runtimeIdentity';
import { codexRuntimeHomeService } from '../agent/CodexRuntimeHomeService';
import { getSharedRootPath, readPersistentAgentSessions } from '../SharedSessionState';

const BUSY_TIMEOUT_MS = 3000;
const STALE_PERSISTENT_SESSION_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const RUNTIME_HOME_PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1_000;
const MAX_RAW_METADATA_BYTES = PERSISTENT_AGENT_SESSION_METADATA_BYTE_LIMIT * 8;

type ActiveCodexRuntimeHomeProvider = () => Iterable<string>;

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
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_RAW_METADATA_BYTES) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return isPlainObject(parsed) ? normalizePersistentAgentSessionMetadata(parsed) : undefined;
  } catch {
    return undefined;
  }
}

function normalizeRecordMetadata(
  metadata: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  return normalizePersistentAgentSessionMetadata(metadata);
}

function normalizeRecord(record: PersistentAgentSessionRecord): PersistentAgentSessionRecord {
  const metadata = normalizeRecordMetadata(record.metadata);
  return {
    ...record,
    metadata,
  };
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
  const metadata = normalizeRecordMetadata(record.metadata);
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
    metadata ? JSON.stringify(metadata) : null,
  ];
}

function cloneRecord(record: PersistentAgentSessionRecord): PersistentAgentSessionRecord {
  return normalizeRecord(record);
}

function compareByUpdatedAtDesc(
  left: PersistentAgentSessionRecord,
  right: PersistentAgentSessionRecord
): number {
  return right.updatedAt - left.updatedAt;
}

function upsertCachedRecord(
  cache: PersistentAgentSessionRecord[],
  record: PersistentAgentSessionRecord
): PersistentAgentSessionRecord[] {
  const nextRecord = cloneRecord(record);
  const nextCache = cache.filter((entry) => entry.uiSessionId !== record.uiSessionId);
  nextCache.push(nextRecord);
  nextCache.sort(compareByUpdatedAtDesc);
  return nextCache;
}

function removeCachedSessions(
  cache: PersistentAgentSessionRecord[],
  uiSessionIds: readonly string[]
): PersistentAgentSessionRecord[] {
  if (uiSessionIds.length === 0) {
    return cache;
  }

  const staleIds = new Set(uiSessionIds);
  return cache.filter((record) => !staleIds.has(record.uiSessionId));
}

function isPrunablePersistentAgentState(
  state: PersistentAgentSessionRow['last_known_state']
): boolean {
  return state === 'dead' || state === 'missing-host-session';
}

function getDatabasePath(): string {
  return join(getSharedRootPath(), getAppRuntimeIdentity().persistentAgentSessionDatabaseFilename);
}

interface PersistentAgentSessionRepositoryDiagnosticsSnapshot {
  cacheSize: number;
  counters: {
    initializeCalls: number;
    listSessionsCalls: number;
    listCachedSessionsCalls: number;
    upsertCalls: number;
    deleteCalls: number;
    writeRecordCalls: number;
    refreshCacheCalls: number;
    pruneCalls: number;
  };
  lastMarkedSessionId: string | null;
  lastPrunedSessionIds: string[];
  lastRefreshedAt: number | null;
}

export class PersistentAgentSessionRepository {
  private db: sqlite3.Database | null = null;
  private initializePromise: Promise<void> | null = null;
  private cache: PersistentAgentSessionRecord[] = [];
  private lastRuntimeHomePrunedAt: number | null = null;
  private activeCodexRuntimeHomeProvider: ActiveCodexRuntimeHomeProvider = () => [];
  private diagnostics = {
    initializeCalls: 0,
    listSessionsCalls: 0,
    listCachedSessionsCalls: 0,
    upsertCalls: 0,
    deleteCalls: 0,
    writeRecordCalls: 0,
    refreshCacheCalls: 0,
    pruneCalls: 0,
    lastMarkedSessionId: null as string | null,
    lastPrunedSessionIds: [] as string[],
    lastRefreshedAt: null as number | null,
  };

  constructor() {
    registerMainProcessDiagnosticsCollector('persistentAgentSessions', () =>
      this.getDiagnosticsSnapshot()
    );
  }

  setActiveCodexRuntimeHomeProvider(provider: ActiveCodexRuntimeHomeProvider): void {
    this.activeCodexRuntimeHomeProvider = provider;
  }

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
    this.diagnostics.listCachedSessionsCalls += 1;
    return this.cache.map(cloneRecord);
  }

  async listSessions(): Promise<PersistentAgentSessionRecord[]> {
    this.diagnostics.listSessionsCalls += 1;
    await this.initialize();
    return this.listCachedSessions();
  }

  async getSession(uiSessionId: string): Promise<PersistentAgentSessionRecord | undefined> {
    await this.initialize();
    const record = this.cache.find((entry) => entry.uiSessionId === uiSessionId);
    return record ? cloneRecord(record) : undefined;
  }

  async upsertSession(record: PersistentAgentSessionRecord): Promise<void> {
    const normalizedRecord = normalizeRecord(record);
    this.diagnostics.upsertCalls += 1;
    this.diagnostics.lastMarkedSessionId = normalizedRecord.uiSessionId;
    await this.initialize();
    await this.writeRecord(normalizedRecord);
    this.cache = upsertCachedRecord(this.cache, normalizedRecord);
    await this.pruneStaleSessions();
  }

  async deleteSession(uiSessionId: string): Promise<void> {
    this.diagnostics.deleteCalls += 1;
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

  getDiagnosticsSnapshot(): PersistentAgentSessionRepositoryDiagnosticsSnapshot {
    return {
      cacheSize: this.cache.length,
      counters: {
        initializeCalls: this.diagnostics.initializeCalls,
        listSessionsCalls: this.diagnostics.listSessionsCalls,
        listCachedSessionsCalls: this.diagnostics.listCachedSessionsCalls,
        upsertCalls: this.diagnostics.upsertCalls,
        deleteCalls: this.diagnostics.deleteCalls,
        writeRecordCalls: this.diagnostics.writeRecordCalls,
        refreshCacheCalls: this.diagnostics.refreshCacheCalls,
        pruneCalls: this.diagnostics.pruneCalls,
      },
      lastMarkedSessionId: this.diagnostics.lastMarkedSessionId,
      lastPrunedSessionIds: [...this.diagnostics.lastPrunedSessionIds],
      lastRefreshedAt: this.diagnostics.lastRefreshedAt,
    };
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
    this.diagnostics.initializeCalls += 1;
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
      const normalizedRecord = normalizeRecord(record);
      await this.writeRecord(normalizedRecord);
      this.cache = upsertCachedRecord(this.cache, normalizedRecord);
    }
  }

  private async refreshCache(): Promise<void> {
    this.diagnostics.refreshCacheCalls += 1;
    const rows = await dbAll<PersistentAgentSessionRow>(
      this.getDb(),
      'SELECT * FROM persistent_agent_sessions ORDER BY updated_at DESC'
    );
    this.cache = rows.flatMap((row) => {
      const record = rowToRecord(row);
      return record ? [record] : [];
    });
    this.diagnostics.lastRefreshedAt = Date.now();
  }

  private async pruneStaleSessions(now = Date.now()): Promise<void> {
    this.diagnostics.pruneCalls += 1;
    const cutoff = now - STALE_PERSISTENT_SESSION_RETENTION_MS;
    const staleSessionIds = this.cache
      .filter(
        (record) =>
          isPrunablePersistentAgentState(record.lastKnownState) && record.updatedAt < cutoff
      )
      .map((record) => record.uiSessionId);

    if (staleSessionIds.length === 0) {
      this.diagnostics.lastPrunedSessionIds = [];
      this.pruneCodexRuntimeHomes(now);
      return;
    }

    await Promise.all(
      staleSessionIds.map((uiSessionId) =>
        dbRun(this.getDb(), 'DELETE FROM persistent_agent_sessions WHERE ui_session_id = ?', [
          uiSessionId,
        ])
      )
    );
    this.cache = removeCachedSessions(this.cache, staleSessionIds);
    this.diagnostics.lastPrunedSessionIds = [...staleSessionIds];
    this.pruneCodexRuntimeHomes(now);
  }

  private pruneCodexRuntimeHomes(now: number): void {
    if (
      this.lastRuntimeHomePrunedAt !== null &&
      now - this.lastRuntimeHomePrunedAt < RUNTIME_HOME_PRUNE_INTERVAL_MS
    ) {
      return;
    }
    this.lastRuntimeHomePrunedAt = now;

    const retainedRuntimeKeys = this.cache
      .filter((record) => record.agentId === 'codex' || record.agentCommand === 'codex')
      .map((record) => record.uiSessionId);
    const retainedHomePaths = this.listActiveCodexRuntimeHomePaths();

    try {
      codexRuntimeHomeService.pruneOrphanedRuntimeHomes({
        retainedRuntimeKeys,
        retainedHomePaths,
        minAgeMs: STALE_PERSISTENT_SESSION_RETENTION_MS,
        now,
      });
    } catch (error) {
      log.warn('[PersistentAgentSessionRepository] Failed to prune Codex runtime homes:', error);
    }
  }

  private listActiveCodexRuntimeHomePaths(): string[] {
    try {
      return [...this.activeCodexRuntimeHomeProvider()].filter(isNonEmptyString);
    } catch (error) {
      log.warn(
        '[PersistentAgentSessionRepository] Failed to resolve active Codex runtime homes:',
        error
      );
      return [];
    }
  }

  private async writeRecord(record: PersistentAgentSessionRecord): Promise<void> {
    this.diagnostics.writeRecordCalls += 1;
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
