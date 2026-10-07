import { randomUUID } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import { link, lstat, mkdir, open, realpath, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import {
  collectSessionFiles,
  normalizeWorktreePath,
  readSessionWorktreePath,
} from './CodexWorkspaceSessionHistory';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_RETRYABLE_FAILURES = 1_000;

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

function isCompleteTranscript(bytes: Buffer): boolean {
  if (bytes.length === 0 || bytes[bytes.length - 1] !== 0x0a) {
    return false;
  }

  try {
    const contents = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const lastLine = contents.trimEnd().split('\n').at(-1);
    if (!lastLine) {
      return false;
    }
    const parsed: unknown = JSON.parse(lastLine);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

async function readSourceWithoutFollowingSymlinks(sourcePath: string): Promise<Buffer> {
  const file = await open(sourcePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    return await file.readFile();
  } finally {
    await file.close();
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

  await mkdir(sessionHistoryPath, { recursive: true });
  const targetRoot = await canonicalize(sessionHistoryPath);
  const sourceRoot = await canonicalize(sourceSessionsPath);
  if (isInsideDirectory(targetRoot, sourceRoot)) {
    return result;
  }

  const existingSessions = await collectSessionFiles(targetRoot);
  if (!existingSessions.complete) {
    retry();
    return result;
  }
  const existingIds = new Set<string>();
  for (const file of existingSessions.files) {
    const metadata = await readSessionWorktreePath(file);
    if (metadata.kind === 'found' && metadata.threadId) {
      existingIds.add(metadata.threadId);
    }
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

      const bytes = await readSourceWithoutFollowingSymlinks(sourceFile);
      if (bytes.length !== before.size || !isCompleteTranscript(bytes)) {
        retry();
        continue;
      }

      await checkTargetDirectories(targetRoot, targetParent, targetDirectories);
      temporaryFile = path.join(targetParent, `.${path.basename(targetFile)}.${randomUUID()}.tmp`);
      const temporaryHandle = await open(temporaryFile, 'wx', 0o600);
      try {
        await temporaryHandle.writeFile(bytes);
      } finally {
        await temporaryHandle.close();
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
          await checkTargetDirectories(targetRoot, path.dirname(temporaryFile), targetDirectories);
          await unlink(temporaryFile);
        } catch {
          // An unverified path may now point outside the workspace history.
        }
      }
    }
  }

  return result;
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
