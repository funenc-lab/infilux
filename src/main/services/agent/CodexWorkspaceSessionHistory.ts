import { createHash } from 'node:crypto';
import { constants, existsSync } from 'node:fs';
import { copyFile, mkdir, open, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { WorkspacePlatform } from '@shared/types/remote';
import { isRemoteVirtualPath } from '@shared/utils/remotePath';
import { normalizeWorkspaceKey } from '@shared/utils/workspace';
import { getSharedRootPath } from '../SharedSessionState';

const SESSION_META_SCAN_BYTES = 16 * 1024;
const LEGACY_MIGRATION_MARKER = '.legacy-session-history-migrated-v1';

export interface CodexWorkspaceSessionHistoryScope {
  repoPath?: string;
  worktreePath?: string;
  historyRoot?: string;
}

export interface MigrateCodexWorkspaceSessionHistoryOptions {
  sessionHistoryPath: string;
  sourceSessionsPaths: readonly string[];
  worktreePath: string;
}

export interface CodexWorkspaceSessionHistoryMigrationResult {
  complete: boolean;
  migratedFileCount: number;
}

type SessionWorktreeLookupResult = { kind: 'found'; worktreePath: string } | { kind: 'unknown' };

interface SessionFileCollectionResult {
  complete: boolean;
  files: string[];
}

function resolveLocalWorkspacePlatform(): WorkspacePlatform {
  if (process.platform === 'darwin') {
    return 'darwin';
  }
  if (process.platform === 'win32') {
    return 'win32';
  }
  return 'linux';
}

function normalizeWorktreePath(value: string | undefined): string {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return '';
  }

  if (isRemoteVirtualPath(trimmedValue)) {
    return normalizeWorkspaceKey(trimmedValue, 'linux');
  }

  return normalizeWorkspaceKey(path.resolve(trimmedValue), resolveLocalWorkspacePlatform());
}

function requireWorktreePath(value: string | undefined): string {
  const worktreePath = normalizeWorktreePath(value);
  if (!worktreePath) {
    throw new Error('Codex session history requires a worktree path');
  }
  return worktreePath;
}

function resolveWorkspaceIdentity(scope: CodexWorkspaceSessionHistoryScope): string {
  return requireWorktreePath(scope.worktreePath);
}

async function readSessionWorktreePath(
  sessionFilePath: string
): Promise<SessionWorktreeLookupResult> {
  try {
    const fileHandle = await open(sessionFilePath, 'r');
    try {
      const buffer = Buffer.alloc(SESSION_META_SCAN_BYTES);
      const { bytesRead } = await fileHandle.read(buffer, 0, buffer.length, 0);
      const lines = buffer.toString('utf8', 0, bytesRead).split('\n');

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }

        let parsed: { type?: unknown; payload?: unknown };
        try {
          parsed = JSON.parse(line) as { type?: unknown; payload?: unknown };
        } catch {
          continue;
        }

        if (
          parsed.type !== 'session_meta' ||
          !parsed.payload ||
          typeof parsed.payload !== 'object'
        ) {
          continue;
        }

        const cwd = (parsed.payload as { cwd?: unknown }).cwd;
        if (typeof cwd !== 'string' || !cwd.trim()) {
          return { kind: 'unknown' };
        }

        return { kind: 'found', worktreePath: cwd };
      }
    } finally {
      await fileHandle.close();
    }
  } catch {
    return { kind: 'unknown' };
  }

  return { kind: 'unknown' };
}

async function collectSessionFiles(
  sourceSessionsPath: string
): Promise<SessionFileCollectionResult> {
  const files: string[] = [];
  const directories = [sourceSessionsPath];
  let complete = true;

  while (directories.length > 0) {
    const directory = directories.pop();
    if (!directory) {
      continue;
    }

    try {
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          directories.push(entryPath);
        } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          files.push(entryPath);
        }
      }
    } catch (error) {
      if (
        directory === sourceSessionsPath &&
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        continue;
      }
      complete = false;
    }
  }

  return { complete, files };
}

function resolveMigrationMarkerPath(sessionHistoryPath: string): string {
  return path.join(path.dirname(sessionHistoryPath), LEGACY_MIGRATION_MARKER);
}

export function resolveCodexWorkspaceSessionHistoryPath(
  scope: CodexWorkspaceSessionHistoryScope
): string {
  const historyRoot =
    scope.historyRoot ?? path.join(getSharedRootPath(), 'codex-session-histories');
  const identity = resolveWorkspaceIdentity(scope);
  const key = createHash('sha256').update(identity).digest('hex').slice(0, 32);
  return path.join(historyRoot, `workspace-${key}`, 'sessions');
}

export async function migrateCodexWorkspaceSessionHistory({
  sessionHistoryPath,
  sourceSessionsPaths,
  worktreePath,
}: MigrateCodexWorkspaceSessionHistoryOptions): Promise<CodexWorkspaceSessionHistoryMigrationResult> {
  const migrationMarkerPath = resolveMigrationMarkerPath(sessionHistoryPath);
  if (existsSync(migrationMarkerPath)) {
    return { complete: true, migratedFileCount: 0 };
  }

  const normalizedWorktreePath = requireWorktreePath(worktreePath);
  await mkdir(sessionHistoryPath, { recursive: true });
  const resolvedHistoryPath = path.resolve(sessionHistoryPath);
  const uniqueSourcePaths = new Set(
    sourceSessionsPaths.map((sourcePath) => path.resolve(sourcePath))
  );
  let complete = true;
  let migratedFileCount = 0;

  for (const sourceSessionsPath of uniqueSourcePaths) {
    if (sourceSessionsPath === resolvedHistoryPath) {
      continue;
    }

    const collection = await collectSessionFiles(sourceSessionsPath);
    complete &&= collection.complete;

    for (const sessionFilePath of collection.files) {
      const sessionWorktree = await readSessionWorktreePath(sessionFilePath);
      if (sessionWorktree.kind !== 'found') {
        complete = false;
        continue;
      }
      if (normalizeWorktreePath(sessionWorktree.worktreePath) !== normalizedWorktreePath) {
        continue;
      }

      const relativeSessionPath = path.relative(sourceSessionsPath, sessionFilePath);
      const targetSessionPath = path.join(sessionHistoryPath, relativeSessionPath);
      try {
        await mkdir(path.dirname(targetSessionPath), { recursive: true });
        await copyFile(sessionFilePath, targetSessionPath, constants.COPYFILE_EXCL);
        migratedFileCount += 1;
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'EEXIST'
        ) {
          continue;
        }
        complete = false;
      }
    }
  }

  if (complete) {
    await writeFile(migrationMarkerPath, String(Date.now()), 'utf8');
  }

  return { complete, migratedFileCount };
}
