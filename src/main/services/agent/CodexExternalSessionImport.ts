import { randomUUID } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import {
  type FileHandle,
  link,
  lstat,
  mkdir,
  open,
  realpath,
  stat,
  unlink,
} from 'node:fs/promises';
import path from 'node:path';
import sqlite3 from 'sqlite3';
import {
  collectSessionFiles,
  normalizeWorktreePath,
  readSessionWorktreePath,
} from './CodexWorkspaceSessionHistory';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_RETRYABLE_FAILURES = 1_000;
const IMPORT_MUTEX_DATABASE_NAME = '.external-session-import.sqlite';
const SOURCE_STREAM_CHUNK_BYTES = 128 * 1024;
// A single record above 64 MiB is deferred; the total transcript size has no limit.
const MAX_JSONL_RECORD_BYTES = 64 * 1024 * 1024;

interface WorkspaceImportMutex {
  database: sqlite3.Database;
  path: string;
  identity: Stats;
  parentIdentity: readonly TargetDirectoryIdentity[];
}

export interface ImportCodexExternalSessionsOptions {
  sessionHistoryPath: string;
  sourceSessionsPath: string;
  worktreePath: string;
}

export interface ImportCodexExternalSessionsResult {
  imported: number;
  refreshed: number;
  retryableFailures: number;
}

async function canonicalize(targetPath: string): Promise<string> {
  try {
    return await realpath(targetPath);
  } catch {
    return path.resolve(targetPath);
  }
}

function isInsideDirectory(directory: string, candidate: string): boolean {
  const relative = path.relative(directory, candidate);
  return (
    !relative ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

interface TargetDirectoryIdentity {
  device: number;
  inode: number;
}

async function checkTargetDirectories(
  targetRoot: string,
  targetParent: string,
  previous?: readonly TargetDirectoryIdentity[]
): Promise<TargetDirectoryIdentity[]> {
  if (!isInsideDirectory(targetRoot, targetParent)) {
    throw new Error('Codex session target is outside its workspace history');
  }

  const relative = path.relative(targetRoot, targetParent);
  const segments = relative ? relative.split(path.sep) : [];
  const checked: TargetDirectoryIdentity[] = [];
  let directory = targetRoot;
  for (const [index, segment] of ['', ...segments].entries()) {
    if (index > 0) {
      directory = path.join(directory, segment);
      if (!previous) {
        try {
          await mkdir(directory);
        } catch (error) {
          if (!hasCode(error, 'EEXIST')) {
            throw error;
          }
        }
      }
    }

    const state = await lstat(directory);
    if (
      !state.isDirectory() ||
      state.isSymbolicLink() ||
      (await realpath(directory)) !== directory
    ) {
      throw new Error('Codex session target directory is not a trusted workspace directory');
    }
    if (
      previous &&
      (previous[index]?.device !== state.dev || previous[index]?.inode !== state.ino)
    ) {
      throw new Error('Codex session target directory changed during import');
    }
    checked.push({ device: state.dev, inode: state.ino });
  }

  return checked;
}

function sourceUnchanged(before: Stats, after: Stats): boolean {
  return (
    before.dev === after.dev &&
    before.ino === after.ino &&
    before.size === after.size &&
    before.mtimeMs === after.mtimeMs
  );
}

function hasSameIdentity(before: Stats, after: Stats): boolean {
  return before.dev === after.dev && before.ino === after.ino;
}

async function inspectMutexDatabase(databasePath: string): Promise<Stats | undefined> {
  try {
    const state = await lstat(databasePath);
    if (
      !state.isFile() ||
      state.isSymbolicLink() ||
      (await realpath(databasePath)) !== databasePath
    ) {
      throw new Error('Codex import mutex database must be a regular workspace file');
    }
    return state;
  } catch (error) {
    if (hasCode(error, 'ENOENT')) {
      return undefined;
    }
    throw error;
  }
}

function execSqlite(database: sqlite3.Database, sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    database.exec(sql, (error: Error | null) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function closeSqlite(database: sqlite3.Database): Promise<void> {
  return new Promise((resolve, reject) => {
    database.close((error: Error | null) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

async function acquireWorkspaceImportMutex(targetRoot: string): Promise<WorkspaceImportMutex> {
  const parent = path.dirname(targetRoot);
  const parentIdentity = await checkTargetDirectories(parent, parent);
  const databasePath = path.join(parent, IMPORT_MUTEX_DATABASE_NAME);
  const initialState = await inspectMutexDatabase(databasePath);
  await checkTargetDirectories(parent, parent, parentIdentity);
  const database = await new Promise<sqlite3.Database>((resolve, reject) => {
    const instance = new sqlite3.Database(
      databasePath,
      sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
      (error: Error | null) => {
        if (error) {
          reject(error);
        } else {
          resolve(instance);
        }
      }
    );
  });

  let acquired = false;
  try {
    database.configure('busyTimeout', 0);
    const identity = await inspectMutexDatabase(databasePath);
    if (!identity || (initialState && !hasSameIdentity(initialState, identity))) {
      throw new Error('Codex import mutex database changed while opening');
    }
    await checkTargetDirectories(parent, parent, parentIdentity);
    await execSqlite(database, 'BEGIN IMMEDIATE');
    acquired = true;
    const mutex: WorkspaceImportMutex = {
      database,
      path: databasePath,
      identity,
      parentIdentity,
    };
    await assertWorkspaceImportMutex(mutex);
    return mutex;
  } catch (error) {
    if (acquired) {
      await execSqlite(database, 'ROLLBACK').catch(() => undefined);
    }
    await closeSqlite(database).catch(() => undefined);
    throw error;
  }
}

async function assertWorkspaceImportMutex(mutex: WorkspaceImportMutex): Promise<void> {
  const parent = path.dirname(mutex.path);
  await checkTargetDirectories(parent, parent, mutex.parentIdentity);
  const current = await inspectMutexDatabase(mutex.path);
  if (!current || !hasSameIdentity(mutex.identity, current)) {
    throw new Error('Codex import mutex database changed during import');
  }
}

async function releaseWorkspaceImportMutex(mutex: WorkspaceImportMutex): Promise<void> {
  try {
    await execSqlite(mutex.database, 'ROLLBACK');
  } finally {
    await closeSqlite(mutex.database);
  }
}

async function copyValidatedSource(
  sourcePath: string,
  destination: FileHandle
): Promise<{ copiedBytes: number; complete: boolean }> {
  const source = await open(sourcePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let currentLine = '';
    let currentLineBytes = 0;
    let currentLineTooLarge = false;
    let lastRecord = '';
    let lastRecordTooLarge = false;
    let oversizedRecordSeen = false;
    let copiedBytes = 0;
    let terminatedByNewline = false;

    const appendSegment = (segment: string): void => {
      if (currentLineTooLarge) {
        return;
      }
      currentLineBytes += Buffer.byteLength(segment, 'utf8');
      if (currentLineBytes > MAX_JSONL_RECORD_BYTES) {
        currentLine = '';
        currentLineTooLarge = true;
        return;
      }
      currentLine += segment;
    };
    const collectLines = (contents: string): void => {
      let offset = 0;
      for (
        let newline = contents.indexOf('\n');
        newline !== -1;
        newline = contents.indexOf('\n', offset)
      ) {
        appendSegment(contents.slice(offset, newline));
        oversizedRecordSeen ||= currentLineTooLarge;
        if (currentLineTooLarge || currentLine.trim()) {
          lastRecord = currentLine;
          lastRecordTooLarge = currentLineTooLarge;
        }
        currentLine = '';
        currentLineBytes = 0;
        currentLineTooLarge = false;
        offset = newline + 1;
      }
      appendSegment(contents.slice(offset));
    };

    for await (const chunk of source.createReadStream({
      autoClose: false,
      highWaterMark: SOURCE_STREAM_CHUNK_BYTES,
    })) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      copiedBytes += bytes.length;
      terminatedByNewline = bytes[bytes.length - 1] === 0x0a;
      collectLines(decoder.decode(bytes, { stream: true }));
      await destination.writeFile(bytes);
    }
    collectLines(decoder.decode());

    if (!terminatedByNewline || !lastRecord || lastRecordTooLarge || oversizedRecordSeen) {
      return { copiedBytes, complete: false };
    }
    try {
      const parsed: unknown = JSON.parse(lastRecord);
      return {
        copiedBytes,
        complete: typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed),
      };
    } catch {
      return { copiedBytes, complete: false };
    }
  } finally {
    await source.close();
  }
}

export async function importCodexExternalSessions({
  sessionHistoryPath,
  sourceSessionsPath,
  worktreePath,
}: ImportCodexExternalSessionsOptions): Promise<ImportCodexExternalSessionsResult> {
  const normalizedWorktree = normalizeWorktreePath(worktreePath);
  if (!normalizedWorktree) {
    throw new Error('Codex external session import requires a worktree path');
  }

  const result: ImportCodexExternalSessionsResult = {
    imported: 0,
    refreshed: 0,
    retryableFailures: 0,
  };
  const retry = (): void => {
    result.retryableFailures = Math.min(result.retryableFailures + 1, MAX_RETRYABLE_FAILURES);
  };

  const originalRoot = path.resolve(sessionHistoryPath);
  const workspaceParent = path.dirname(originalRoot);
  let targetRoot: string;
  try {
    await mkdir(workspaceParent, { recursive: true });
    const parent = await lstat(workspaceParent);
    if (!parent.isDirectory() || parent.isSymbolicLink()) {
      throw new Error('Codex workspace history parent must be a regular directory');
    }
    try {
      await mkdir(originalRoot);
    } catch (error) {
      if (!hasCode(error, 'EEXIST')) {
        throw error;
      }
    }
    const root = await lstat(originalRoot);
    if (!root.isDirectory() || root.isSymbolicLink()) {
      throw new Error('Codex workspace session history must be a regular directory');
    }
    targetRoot = await realpath(originalRoot);
    if (path.dirname(targetRoot) !== (await realpath(workspaceParent))) {
      throw new Error('Codex session history does not belong to its workspace');
    }
  } catch {
    retry();
    return result;
  }

  const sourceRoot = await canonicalize(sourceSessionsPath);
  if (isInsideDirectory(targetRoot, sourceRoot)) {
    return result;
  }

  let workspaceMutex: WorkspaceImportMutex;
  try {
    workspaceMutex = await acquireWorkspaceImportMutex(targetRoot);
  } catch {
    retry();
    return result;
  }

  try {
    await assertWorkspaceImportMutex(workspaceMutex);
    const existingSessions = await collectSessionFiles(targetRoot);
    if (!existingSessions.complete) {
      retry();
      return result;
    }
    const existingIds = new Set<string>();
    for (const file of existingSessions.files) {
      const metadata = await readSessionWorktreePath(file);
      if (metadata.kind !== 'found' || !metadata.threadId?.trim()) {
        retry();
        return result;
      }
      existingIds.add(metadata.threadId);
    }

    const sourceSessions = await collectSessionFiles(sourceRoot);
    if (!sourceSessions.complete) {
      retry();
    }
    for (const sourceFile of sourceSessions.files.sort()) {
      if (isInsideDirectory(targetRoot, sourceFile)) {
        continue;
      }

      const relativePath = path.relative(sourceRoot, sourceFile);
      const targetFile = path.join(targetRoot, relativePath);
      let temporaryFile: string | undefined;
      let targetDirectories: TargetDirectoryIdentity[] | undefined;

      try {
        const entry = await lstat(sourceFile);
        if (!entry.isFile()) {
          continue;
        }
        const before = await stat(sourceFile);
        const metadata = await readSessionWorktreePath(sourceFile);
        if (
          metadata.kind !== 'found' ||
          !metadata.threadId ||
          !UUID_PATTERN.test(metadata.threadId)
        ) {
          retry();
          continue;
        }
        if (normalizeWorktreePath(metadata.worktreePath) !== normalizedWorktree) {
          continue;
        }
        if (existingIds.has(metadata.threadId)) {
          continue;
        }

        const targetParent = path.dirname(targetFile);
        targetDirectories = await checkTargetDirectories(targetRoot, targetParent);
        try {
          await lstat(targetFile);
          continue;
        } catch (error) {
          if (!hasCode(error, 'ENOENT')) {
            throw error;
          }
        }

        await checkTargetDirectories(targetRoot, targetParent, targetDirectories);
        temporaryFile = path.join(
          targetParent,
          `.${path.basename(targetFile)}.${randomUUID()}.tmp`
        );
        const temporaryHandle = await open(temporaryFile, 'wx', 0o600);
        let copyResult: Awaited<ReturnType<typeof copyValidatedSource>>;
        try {
          copyResult = await copyValidatedSource(sourceFile, temporaryHandle);
        } finally {
          await temporaryHandle.close();
        }

        if (copyResult.copiedBytes !== before.size || !copyResult.complete) {
          retry();
          continue;
        }

        const after = await stat(sourceFile);
        if (!sourceUnchanged(before, after)) {
          retry();
          continue;
        }

        await checkTargetDirectories(targetRoot, targetParent, targetDirectories);
        await assertWorkspaceImportMutex(workspaceMutex);
        try {
          await link(temporaryFile, targetFile);
          result.imported += 1;
          existingIds.add(metadata.threadId);
        } catch (error) {
          if (!hasCode(error, 'EEXIST')) {
            throw error;
          }
        }
      } catch {
        retry();
      } finally {
        if (temporaryFile && targetDirectories) {
          try {
            await checkTargetDirectories(
              targetRoot,
              path.dirname(temporaryFile),
              targetDirectories
            );
            await unlink(temporaryFile);
          } catch {
            // An unverified path may now point outside the workspace history.
          }
        }
      }
    }

    return result;
  } finally {
    await releaseWorkspaceImportMutex(workspaceMutex);
  }
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
