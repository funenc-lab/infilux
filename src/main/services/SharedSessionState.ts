import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RUNTIME_STATE_DIRNAME, SESSION_STATE_FILENAME, SETTINGS_FILENAME } from '@shared/paths';
import type {
  PersistentAgentSessionRecord,
  SessionStorageDocument,
  SessionTodoTask,
} from '@shared/types';
import { app } from 'electron';

const STORAGE_VERSION = 2;
const SETTINGS_MIGRATION_MARKER = '.local-settings-migrated';
const TODO_MIGRATION_MARKER = '.local-todo-migrated';
const LOCAL_STORAGE_MIGRATION_MARKER = '.local-localstorage-migrated';

let cachedSettings: Record<string, unknown> | null = null;
let cachedSessionState: SessionStorageDocument | null = null;

function ensureDir(dirPath: string): void {
  mkdirSync(dirPath, { recursive: true });
}

function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function now(): number {
  return Date.now();
}

export function getSharedRootPath(): string {
  return join(
    process.env.HOME || process.env.USERPROFILE || app.getPath('home'),
    RUNTIME_STATE_DIRNAME
  );
}

function getSettingsPath(): string {
  return join(getSharedRootPath(), SETTINGS_FILENAME);
}

function getSessionPath(): string {
  return join(getSharedRootPath(), SESSION_STATE_FILENAME);
}

function getMigrationMarkerPath(marker: string): string {
  return join(getSharedRootPath(), marker);
}

function atomicWriteJson(targetPath: string, data: unknown): void {
  ensureDir(getSharedRootPath());
  const tempPath = `${targetPath}.tmp`;
  writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  renameSync(tempPath, targetPath);
}

function defaultSessionStorageDocument(
  input?: Partial<
    Pick<
      SessionStorageDocument,
      'updatedAt' | 'settingsData' | 'localStorage' | 'persistentAgentSessions' | 'todos'
    >
  >
): SessionStorageDocument {
  return {
    version: STORAGE_VERSION,
    updatedAt: input?.updatedAt ?? now(),
    settingsData: input?.settingsData ?? {},
    localStorage: input?.localStorage ?? {},
    persistentAgentSessions: input?.persistentAgentSessions ?? [],
    todos: input?.todos ?? {},
  };
}

function normalizePersistentAgentSessions(value: unknown): PersistentAgentSessionRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is PersistentAgentSessionRecord => {
    if (!item || typeof item !== 'object') {
      return false;
    }

    const record = item as Partial<PersistentAgentSessionRecord>;
    return (
      typeof record.uiSessionId === 'string' &&
      record.uiSessionId.length > 0 &&
      typeof record.agentId === 'string' &&
      record.agentId.length > 0 &&
      typeof record.agentCommand === 'string' &&
      record.agentCommand.length > 0 &&
      typeof record.environment === 'string' &&
      typeof record.repoPath === 'string' &&
      typeof record.cwd === 'string' &&
      typeof record.displayName === 'string' &&
      typeof record.activated === 'boolean' &&
      typeof record.initialized === 'boolean' &&
      typeof record.hostKind === 'string' &&
      typeof record.hostSessionKey === 'string' &&
      record.hostSessionKey.length > 0 &&
      typeof record.recoveryPolicy === 'string' &&
      typeof record.createdAt === 'number' &&
      typeof record.updatedAt === 'number' &&
      typeof record.lastKnownState === 'string'
    );
  });
}

function normalizeTodoMap(value: unknown): Record<string, SessionTodoTask[]> {
  if (!value || typeof value !== 'object') {
    return {};
  }
  return value as Record<string, SessionTodoTask[]>;
}

function normalizeSettings(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function readJsonFile<T>(targetPath: string): T | null {
  if (!existsSync(targetPath)) {
    return null;
  }
  try {
    return safeJsonParse<T>(readFileSync(targetPath, 'utf-8'));
  } catch {
    return null;
  }
}

export function readSharedSettings(): Record<string, unknown> {
  if (cachedSettings) {
    return cachedSettings;
  }
  const parsed = normalizeSettings(readJsonFile<Record<string, unknown>>(getSettingsPath()));
  cachedSettings = parsed;
  return parsed;
}

export function writeSharedSettings(data: Record<string, unknown>): void {
  cachedSettings = data;
  atomicWriteJson(getSettingsPath(), data);
}

export function readSharedSessionState(): SessionStorageDocument {
  if (cachedSessionState) {
    return cachedSessionState;
  }

  const parsed = readJsonFile<Partial<SessionStorageDocument>>(getSessionPath());
  cachedSessionState =
    parsed && parsed.version === STORAGE_VERSION
      ? defaultSessionStorageDocument({
          updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : now(),
          settingsData: normalizeSettings(parsed.settingsData),
          localStorage:
            parsed.localStorage && typeof parsed.localStorage === 'object'
              ? (parsed.localStorage as Record<string, string>)
              : {},
          persistentAgentSessions: normalizePersistentAgentSessions(parsed.persistentAgentSessions),
          todos: normalizeTodoMap(parsed.todos),
        })
      : defaultSessionStorageDocument();

  return cachedSessionState;
}

export function writeSharedSessionState(data: SessionStorageDocument): void {
  cachedSessionState = {
    ...data,
    version: STORAGE_VERSION,
  };
  atomicWriteJson(getSessionPath(), cachedSessionState);
}

export function updateSharedSessionState(
  updater: (current: SessionStorageDocument) => SessionStorageDocument
): SessionStorageDocument {
  const next = updater(readSharedSessionState());
  writeSharedSessionState(next);
  return next;
}

export function getSharedLocalStorageSnapshot(): Record<string, string> {
  return { ...readSharedSessionState().localStorage };
}

export function writeSharedLocalStorageSnapshot(snapshot: Record<string, string>): void {
  updateSharedSessionState((current) => ({
    ...current,
    updatedAt: now(),
    localStorage: { ...snapshot },
  }));
}

export function readPersistentAgentSessions(): PersistentAgentSessionRecord[] {
  return [...readSharedSessionState().persistentAgentSessions];
}

export function writePersistentAgentSessions(records: PersistentAgentSessionRecord[]): void {
  updateSharedSessionState((current) => ({
    ...current,
    updatedAt: now(),
    persistentAgentSessions: [...records],
  }));
}

export function updatePersistentAgentSessions(
  updater: (current: PersistentAgentSessionRecord[]) => PersistentAgentSessionRecord[]
): PersistentAgentSessionRecord[] {
  const next = updater(readPersistentAgentSessions());
  writePersistentAgentSessions(next);
  return next;
}

export function readSharedTodoTasks(repoPath: string): SessionTodoTask[] {
  return [...(readSharedSessionState().todos[repoPath] ?? [])].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status.localeCompare(b.status);
    }
    return a.order - b.order;
  });
}

export function writeSharedSettingsToSession(data: Record<string, unknown>): void {
  updateSharedSessionState((current) => ({
    ...current,
    updatedAt: now(),
    settingsData: data,
  }));
}

export function readSharedSettingsFromSession(): Record<string, unknown> {
  return { ...readSharedSessionState().settingsData };
}

export function getSharedStatePaths(): {
  root: string;
  settingsPath: string;
  sessionPath: string;
  settingsMarkerPath: string;
  todoMarkerPath: string;
  localStorageMarkerPath: string;
} {
  return {
    root: getSharedRoot(),
    settingsPath: getSettingsPath(),
    sessionPath: getSessionPath(),
    settingsMarkerPath: getMigrationMarkerPath(SETTINGS_MIGRATION_MARKER),
    todoMarkerPath: getMigrationMarkerPath(TODO_MIGRATION_MARKER),
    localStorageMarkerPath: getMigrationMarkerPath(LOCAL_STORAGE_MIGRATION_MARKER),
  };
}

export function isLegacySettingsMigrated(): boolean {
  return existsSync(getMigrationMarkerPath(SETTINGS_MIGRATION_MARKER));
}

export function markLegacySettingsMigrated(): void {
  ensureDir(getSharedRoot());
  writeFileSync(getMigrationMarkerPath(SETTINGS_MIGRATION_MARKER), String(now()), 'utf-8');
}

export function isLegacyTodoMigrated(): boolean {
  return existsSync(getMigrationMarkerPath(TODO_MIGRATION_MARKER));
}

export function markLegacyTodoMigrated(): void {
  ensureDir(getSharedRoot());
  writeFileSync(getMigrationMarkerPath(TODO_MIGRATION_MARKER), String(now()), 'utf-8');
}

export function isLegacyLocalStorageMigrated(): boolean {
  return existsSync(getMigrationMarkerPath(LOCAL_STORAGE_MIGRATION_MARKER));
}

export function markLegacyLocalStorageMigrated(): void {
  ensureDir(getSharedRoot());
  writeFileSync(getMigrationMarkerPath(LOCAL_STORAGE_MIGRATION_MARKER), String(now()), 'utf-8');
}

export function clearSharedStateCache(): void {
  cachedSettings = null;
  cachedSessionState = null;
}
