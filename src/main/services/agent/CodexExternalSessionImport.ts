import { randomUUID } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import {
  type FileHandle,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  stat,
  unlink,
} from 'node:fs/promises';
import path from 'node:path';
import {
  collectSessionFiles,
  normalizeWorktreePath,
  readSessionWorktreePath,
} from './CodexWorkspaceSessionHistory';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_RETRYABLE_FAILURES = 1_000;
const IMPORT_LOCK_NAME = '.external-session-import.lock';
const STALE_LOCK_AGE_MS = 15 * 60 * 1_000;
const SOURCE_STREAM_CHUNK_BYTES = 128 * 1024;
// A single record above 64 MiB is deferred; the total transcript size has no limit.
const MAX_LAST_JSONL_RECORD_BYTES = 64 * 1024 * 1024;

interface WorkspaceImportLock {
  handle: FileHandle;
  path: string;
  token: string;
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

async function reclaimAbandonedLock(lockPath: string): Promise<boolean> {
  let before: Stats;
  let contents: string;
  try {
    before = await lstat(lockPath);
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      Date.now() - before.mtimeMs < STALE_LOCK_AGE_MS
    ) {
      return false;
    }
    contents = await readFile(lockPath, 'utf8');
  } catch {
    return false;
  }

  let owner: { pid?: unknown; token?: unknown; createdAt?: unknown };
  try {
    owner = JSON.parse(contents) as typeof owner;
  } catch {
    return false;
  }
  if (
    !Number.isSafeInteger(owner.pid) ||
    typeof owner.pid !== 'number' ||
    owner.pid < 1 ||
    typeof owner.token !== 'string' ||
    !UUID_PATTERN.test(owner.token) ||
    typeof owner.createdAt !== 'number' ||
    Date.now() - owner.createdAt < STALE_LOCK_AGE_MS
  ) {
    return false;
  }

  try {
    process.kill(owner.pid, 0);
    return false;
  } catch (error) {
    if (!hasCode(error, 'ESRCH')) {
      return false;
    }
  }

  try {
    const after = await lstat(lockPath);
    if (!hasSameIdentity(before, after) || (await readFile(lockPath, 'utf8')) !== contents) {
      return false;
    }
    await unlink(lockPath);
    return true;
  } catch {
    return false;
  }
}

async function acquireWorkspaceImportLock(
  targetRoot: string
): Promise<WorkspaceImportLock | undefined> {
  const parent = path.dirname(targetRoot);
  const parentIdentity = await checkTargetDirectories(parent, parent);
  const lockPath = path.join(parent, IMPORT_LOCK_NAME);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await checkTargetDirectories(parent, parent, parentIdentity);
    let handle: FileHandle;
    try {
      handle = await open(lockPath, 'wx', 0o600);
    } catch (error) {
      if (attempt === 0 && hasCode(error, 'EEXIST') && (await reclaimAbandonedLock(lockPath))) {
        continue;
      }
      if (hasCode(error, 'EEXIST')) {
        return undefined;
      }
      throw error;
    }

    const identity = await handle.stat();
    const token = randomUUID();
    try {
      await handle.writeFile(
        Buffer.from(JSON.stringify({ pid: process.pid, token, createdAt: Date.now() }))
      );
    } catch (error) {
      await handle.close();
      try {
        await checkTargetDirectories(parent, parent, parentIdentity);
        if (hasSameIdentity(identity, await lstat(lockPath))) {
          await unlink(lockPath);
        }
      } catch {
        // Never remove a lock after its parent or file identity changes.
      }
      throw error;
    }
    return { handle, path: lockPath, token, identity, parentIdentity };
  }

  return undefined;
}

async function releaseWorkspaceImportLock(lock: WorkspaceImportLock): Promise<void> {
  try {
    const parent = path.dirname(lock.path);
    await checkTargetDirectories(parent, parent, lock.parentIdentity);
    if (!hasSameIdentity(lock.identity, await lstat(lock.path))) {
      return;
    }
    const contents: unknown = JSON.parse(await readFile(lock.path, 'utf8'));
    if (
      typeof contents !== 'object' ||
      contents === null ||
      !('token' in contents) ||
      contents.token !== lock.token
    ) {
      return;
    }
    await unlink(lock.path);
  } catch {
    // An unverified lock must not be removed by this import.
  } finally {
    await lock.handle.close();
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
    let copiedBytes = 0;
    let terminatedByNewline = false;

    const appendSegment = (segment: string): void => {
      if (currentLineTooLarge) {
        return;
      }
      currentLineBytes += Buffer.byteLength(segment, 'utf8');
      if (currentLineBytes > MAX_LAST_JSONL_RECORD_BYTES) {
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

    if (!terminatedByNewline || !lastRecord || lastRecordTooLarge) {
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

  let workspaceLock: WorkspaceImportLock | undefined;
  try {
    workspaceLock = await acquireWorkspaceImportLock(targetRoot);
  } catch {
    retry();
    return result;
  }
  if (!workspaceLock) {
    retry();
    return result;
  }

  try {
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
    await releaseWorkspaceImportLock(workspaceLock);
  }
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
