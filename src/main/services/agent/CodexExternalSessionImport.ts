import { createHash, randomUUID } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import {
  type FileHandle,
  link,
  lstat,
  mkdir,
  open,
  realpath,
  rename,
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
const PROVENANCE_SUFFIX = '.infilux-import.json';
const MAX_PROVENANCE_BYTES = 4096;

interface ImportedSessionProvenance {
  version: 1;
  sourceRoot: string;
  relativePath: string;
  threadId: string;
  sourceHash: string;
  sourceSize: number;
  sourceDevice: number;
  sourceInode: number;
  sourceMtimeMs: number;
  targetHash: string;
  targetSize: number;
}

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

function isValidProvenance(value: unknown): value is ImportedSessionProvenance {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Partial<ImportedSessionProvenance>;
  return (
    record.version === 1 &&
    typeof record.sourceRoot === 'string' &&
    path.isAbsolute(record.sourceRoot) &&
    typeof record.relativePath === 'string' &&
    !!record.relativePath &&
    !path.isAbsolute(record.relativePath) &&
    record.relativePath.split(path.sep).every((segment) => segment !== '..' && segment !== '.') &&
    typeof record.threadId === 'string' &&
    UUID_PATTERN.test(record.threadId) &&
    typeof record.sourceHash === 'string' &&
    /^[0-9a-f]{64}$/.test(record.sourceHash) &&
    typeof record.targetHash === 'string' &&
    /^[0-9a-f]{64}$/.test(record.targetHash) &&
    record.targetHash === record.sourceHash &&
    typeof record.sourceSize === 'number' &&
    Number.isSafeInteger(record.sourceSize) &&
    record.sourceSize > 0 &&
    typeof record.sourceDevice === 'number' &&
    Number.isSafeInteger(record.sourceDevice) &&
    typeof record.sourceInode === 'number' &&
    Number.isSafeInteger(record.sourceInode) &&
    typeof record.sourceMtimeMs === 'number' &&
    Number.isFinite(record.sourceMtimeMs) &&
    typeof record.targetSize === 'number' &&
    record.targetSize === record.sourceSize
  );
}

async function readOwnedProvenance(
  targetPath: string
): Promise<ImportedSessionProvenance | undefined> {
  const provenancePath = `${targetPath}${PROVENANCE_SUFFIX}`;
  try {
    const state = await lstat(provenancePath);
    if (!state.isFile() || state.isSymbolicLink() || state.size > MAX_PROVENANCE_BYTES) {
      return undefined;
    }
    const handle = await open(provenancePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const opened = await handle.stat();
      if (!opened.isFile() || !sourceUnchanged(state, opened)) {
        return undefined;
      }
      const buffer = Buffer.alloc(MAX_PROVENANCE_BYTES + 1);
      let size = 0;
      while (size < buffer.length) {
        const { bytesRead } = await handle.read(buffer, size, buffer.length - size, size);
        if (bytesRead === 0) {
          break;
        }
        size += bytesRead;
      }
      const after = await handle.stat();
      if (size !== state.size || !sourceUnchanged(state, after)) {
        return undefined;
      }
      const parsed: unknown = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, size))
      );
      return isValidProvenance(parsed) ? parsed : undefined;
    } finally {
      await handle.close();
    }
  } catch {
    return undefined;
  }
}

async function verifyUnchangedTarget(
  targetPath: string,
  expected: ImportedSessionProvenance
): Promise<Stats | undefined> {
  const before = await lstat(targetPath);
  if (!before.isFile() || before.isSymbolicLink() || before.size !== expected.targetSize) {
    return undefined;
  }
  const handle = await open(targetPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const actual = await handle.stat();
    if (!sourceUnchanged(before, actual)) {
      return undefined;
    }
    const hash = createHash('sha256');
    for await (const chunk of handle.createReadStream({
      autoClose: false,
      highWaterMark: SOURCE_STREAM_CHUNK_BYTES,
    })) {
      hash.update(chunk);
    }
    if (hash.digest('hex') !== expected.targetHash) {
      return undefined;
    }
    const after = await handle.stat();
    const namedAfter = await lstat(targetPath);
    return sourceUnchanged(before, after) && sourceUnchanged(before, namedAfter)
      ? namedAfter
      : undefined;
  } finally {
    await handle.close();
  }
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
  destination: FileHandle,
  previousSize = 0
): Promise<{ copiedBytes: number; complete: boolean; digest: string; previousDigest: string }> {
  const source = await open(sourcePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const digest = createHash('sha256');
    const previousDigest = createHash('sha256');
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
      digest.update(bytes);
      const previousBytes = Math.max(0, Math.min(bytes.length, previousSize - copiedBytes));
      if (previousBytes > 0) {
        previousDigest.update(bytes.subarray(0, previousBytes));
      }
      copiedBytes += bytes.length;
      terminatedByNewline = bytes[bytes.length - 1] === 0x0a;
      collectLines(decoder.decode(bytes, { stream: true }));
      await destination.writeFile(bytes);
    }
    collectLines(decoder.decode());

    const hashes = {
      copiedBytes,
      digest: digest.digest('hex'),
      previousDigest: previousDigest.digest('hex'),
    };
    if (!terminatedByNewline || !lastRecord || lastRecordTooLarge || oversizedRecordSeen) {
      return { ...hashes, complete: false };
    }
    try {
      const parsed: unknown = JSON.parse(lastRecord);
      return {
        ...hashes,
        complete: typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed),
      };
    } catch {
      return { ...hashes, complete: false };
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
    const existingIds = new Map<string, string | undefined>();
    for (const file of existingSessions.files) {
      const metadata = await readSessionWorktreePath(file);
      if (metadata.kind !== 'found' || !metadata.threadId?.trim()) {
        retry();
        return result;
      }
      existingIds.set(
        metadata.threadId,
        existingIds.has(metadata.threadId) ||
          normalizeWorktreePath(metadata.worktreePath) !== normalizedWorktree
          ? undefined
          : file
      );
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
      let targetFile = path.join(targetRoot, relativePath);
      let temporaryFile: string | undefined;
      let temporaryProvenance: string | undefined;
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
        const knownThread = existingIds.has(metadata.threadId);
        const ownedTarget = existingIds.get(metadata.threadId);
        if (knownThread && !ownedTarget) {
          continue;
        }
        if (ownedTarget) {
          targetFile = ownedTarget;
        }

        const targetParent = path.dirname(targetFile);
        targetDirectories = await checkTargetDirectories(targetRoot, targetParent);
        let provenance: ImportedSessionProvenance | undefined;
        let originalTarget: Stats | undefined;
        if (ownedTarget) {
          provenance = await readOwnedProvenance(targetFile);
          if (
            !provenance ||
            provenance.sourceRoot !== sourceRoot ||
            provenance.threadId !== metadata.threadId
          ) {
            continue;
          }
          if (
            provenance.relativePath === relativePath &&
            provenance.sourceSize === before.size &&
            provenance.sourceDevice === before.dev &&
            provenance.sourceInode === before.ino &&
            provenance.sourceMtimeMs === before.mtimeMs
          ) {
            continue;
          }
          originalTarget = await verifyUnchangedTarget(targetFile, provenance);
          if (!originalTarget) {
            continue;
          }
        } else {
          try {
            await lstat(targetFile);
            continue;
          } catch (error) {
            if (!hasCode(error, 'ENOENT')) {
              throw error;
            }
          }
          try {
            await lstat(`${targetFile}${PROVENANCE_SUFFIX}`);
            continue;
          } catch (error) {
            if (!hasCode(error, 'ENOENT')) {
              throw error;
            }
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
          copyResult = await copyValidatedSource(
            sourceFile,
            temporaryHandle,
            provenance?.sourceSize
          );
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

        if (provenance) {
          if (
            copyResult.copiedBytes === provenance.sourceSize &&
            copyResult.digest === provenance.sourceHash
          ) {
            continue;
          }
          if (
            copyResult.copiedBytes <= provenance.sourceSize ||
            copyResult.previousDigest !== provenance.sourceHash
          ) {
            if (provenance.relativePath === relativePath) {
              retry();
            }
            continue;
          }
        }

        const nextProvenance: ImportedSessionProvenance = {
          version: 1,
          sourceRoot,
          relativePath,
          threadId: metadata.threadId,
          sourceHash: copyResult.digest,
          sourceSize: copyResult.copiedBytes,
          sourceDevice: after.dev,
          sourceInode: after.ino,
          sourceMtimeMs: after.mtimeMs,
          targetHash: copyResult.digest,
          targetSize: copyResult.copiedBytes,
        };
        temporaryProvenance = path.join(
          targetParent,
          `.${path.basename(targetFile)}.${randomUUID()}.provenance.tmp`
        );
        const provenanceHandle = await open(temporaryProvenance, 'wx', 0o600);
        try {
          await provenanceHandle.writeFile(JSON.stringify(nextProvenance));
        } finally {
          await provenanceHandle.close();
        }

        await checkTargetDirectories(targetRoot, targetParent, targetDirectories);
        await assertWorkspaceImportMutex(workspaceMutex);
        if (provenance) {
          const currentProvenance = await readOwnedProvenance(targetFile);
          const currentTarget = await verifyUnchangedTarget(targetFile, provenance);
          if (
            !currentProvenance ||
            JSON.stringify(currentProvenance) !== JSON.stringify(provenance) ||
            !currentTarget ||
            !originalTarget ||
            !sourceUnchanged(originalTarget, currentTarget)
          ) {
            retry();
            continue;
          }
          await checkTargetDirectories(targetRoot, targetParent, targetDirectories);
          await rename(temporaryFile, targetFile);
          temporaryFile = undefined;
          await rename(temporaryProvenance, `${targetFile}${PROVENANCE_SUFFIX}`);
          temporaryProvenance = undefined;
          result.refreshed += 1;
        } else {
          try {
            await link(temporaryFile, targetFile);
          } catch (error) {
            if (!hasCode(error, 'EEXIST')) {
              throw error;
            }
            existingIds.set(metadata.threadId, undefined);
            continue;
          }
          existingIds.set(metadata.threadId, undefined);
          await checkTargetDirectories(targetRoot, targetParent, targetDirectories);
          // An exclusive link leaves any concurrently created user sidecar untouched.
          await link(temporaryProvenance, `${targetFile}${PROVENANCE_SUFFIX}`);
          existingIds.set(metadata.threadId, targetFile);
          result.imported += 1;
        }
      } catch {
        retry();
      } finally {
        for (const ownTemporary of [temporaryFile, temporaryProvenance]) {
          if (ownTemporary && targetDirectories) {
            try {
              await checkTargetDirectories(
                targetRoot,
                path.dirname(ownTemporary),
                targetDirectories
              );
              await unlink(ownTemporary);
            } catch {
              // An unverified path may now point outside the workspace history.
            }
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
