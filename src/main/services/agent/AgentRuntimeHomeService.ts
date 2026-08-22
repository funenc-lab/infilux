import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import path from 'node:path';
import { markManagedRuntimeHome } from './RuntimeHomeProvenance';

export interface AgentRuntimeHomeResult {
  homePath: string;
  sourceHomePath: string;
}

export interface AgentRuntimeHomePruneOptions {
  retainedRuntimeKeys: Iterable<string>;
  retainedHomePaths?: Iterable<string>;
  minAgeMs: number;
  now?: number;
}

export interface AgentRuntimeHomePruneResult {
  prunedHomePaths: string[];
  retainedHomePaths: string[];
  skippedHomePaths: string[];
}

export interface AgentRuntimeHomeServiceOptions {
  sourceHomePath: string;
  runtimeRootPath: string;
  sharedEntryNames: readonly string[];
}

function sanitizeRuntimeKey(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, '-').replace(/^-+|-+$/g, '') || 'session';
}

function ensureLinkedEntry(sourcePath: string, targetPath: string): void {
  if (!existsSync(sourcePath)) {
    return;
  }

  if (existsSync(targetPath)) {
    const stat = lstatSync(targetPath);
    if (stat.isSymbolicLink() && readlinkSync(targetPath) === sourcePath) {
      return;
    }
    if (stat.isSymbolicLink()) {
      unlinkSync(targetPath);
    } else {
      return;
    }
  }

  const sourceStat = lstatSync(sourcePath);
  const symlinkType =
    process.platform === 'win32' && sourceStat.isDirectory() ? 'junction' : undefined;
  symlinkSync(sourcePath, targetPath, symlinkType);
}

function getRuntimeHomeActivityMtimeMs(runtimeHomePath: string): number {
  return lstatSync(runtimeHomePath).mtimeMs;
}

export class AgentRuntimeHomeService {
  private readonly sourceHomePath: string;
  private readonly runtimeRootPath: string;
  private readonly sharedEntryNames: readonly string[];
  private readonly operationLocks = new Map<string, Promise<void>>();

  constructor(options: AgentRuntimeHomeServiceOptions) {
    this.sourceHomePath = options.sourceHomePath;
    this.runtimeRootPath = options.runtimeRootPath;
    this.sharedEntryNames = options.sharedEntryNames;
  }

  prepareRuntimeHome(runtimeKey: string): AgentRuntimeHomeResult {
    const safeRuntimeKey = sanitizeRuntimeKey(runtimeKey);
    const homePath = path.join(this.runtimeRootPath, safeRuntimeKey);
    mkdirSync(homePath, { recursive: true });
    markManagedRuntimeHome(homePath);

    for (const entryName of this.sharedEntryNames) {
      ensureLinkedEntry(path.join(this.sourceHomePath, entryName), path.join(homePath, entryName));
    }

    return {
      homePath,
      sourceHomePath: this.sourceHomePath,
    };
  }

  async runExclusive<T>(runtimeKey: string, operation: () => Promise<T> | T): Promise<T> {
    const safeRuntimeKey = sanitizeRuntimeKey(runtimeKey);
    const previousLock = this.operationLocks.get(safeRuntimeKey) ?? Promise.resolve();
    let releaseCurrentLock: () => void = () => undefined;
    const currentLock = new Promise<void>((resolve) => {
      releaseCurrentLock = resolve;
    });
    const trackedLock = previousLock.catch(() => undefined).then(() => currentLock);
    this.operationLocks.set(safeRuntimeKey, trackedLock);

    await previousLock.catch(() => undefined);

    try {
      return await operation();
    } finally {
      releaseCurrentLock();
      if (this.operationLocks.get(safeRuntimeKey) === trackedLock) {
        this.operationLocks.delete(safeRuntimeKey);
      }
    }
  }

  async releaseRuntimeHome(homePath: string): Promise<boolean> {
    const runtimeRootPath = path.resolve(this.runtimeRootPath);
    const resolvedHomePath = path.resolve(homePath);
    if (
      resolvedHomePath === runtimeRootPath ||
      path.dirname(resolvedHomePath) !== runtimeRootPath
    ) {
      return false;
    }

    const runtimeKey = path.basename(resolvedHomePath);
    if (sanitizeRuntimeKey(runtimeKey) !== runtimeKey) {
      return false;
    }

    return this.runExclusive(runtimeKey, () => {
      if (!existsSync(resolvedHomePath)) {
        return false;
      }

      const stat = lstatSync(resolvedHomePath);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        return false;
      }

      rmSync(resolvedHomePath, { recursive: true, force: true });
      return true;
    });
  }

  pruneOrphanedRuntimeHomes(options: AgentRuntimeHomePruneOptions): AgentRuntimeHomePruneResult {
    const result: AgentRuntimeHomePruneResult = {
      prunedHomePaths: [],
      retainedHomePaths: [],
      skippedHomePaths: [],
    };

    if (!existsSync(this.runtimeRootPath)) {
      return result;
    }

    const retainedRuntimeKeys = new Set(
      [...options.retainedRuntimeKeys].map((runtimeKey) => sanitizeRuntimeKey(runtimeKey))
    );
    const retainedHomePaths = new Set(
      [...(options.retainedHomePaths ?? [])].map((homePath) => path.resolve(homePath))
    );
    const now = options.now ?? Date.now();

    for (const entryName of readdirSync(this.runtimeRootPath)) {
      const homePath = path.join(this.runtimeRootPath, entryName);
      const resolvedHomePath = path.resolve(homePath);

      try {
        const stat = lstatSync(homePath);
        if (!stat.isDirectory() || stat.isSymbolicLink()) {
          result.skippedHomePaths.push(homePath);
          continue;
        }

        if (retainedRuntimeKeys.has(entryName) || retainedHomePaths.has(resolvedHomePath)) {
          result.retainedHomePaths.push(homePath);
          continue;
        }

        const activityMtimeMs = getRuntimeHomeActivityMtimeMs(homePath);
        if (now - activityMtimeMs < options.minAgeMs) {
          result.retainedHomePaths.push(homePath);
          continue;
        }

        rmSync(homePath, { recursive: true, force: true });
        result.prunedHomePaths.push(homePath);
      } catch {
        result.skippedHomePaths.push(homePath);
      }
    }

    return result;
  }
}
