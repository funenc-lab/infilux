import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import path from 'node:path';
import { getSharedRootPath } from '../SharedSessionState';
import {
  type AgentRuntimeHomePruneOptions,
  type AgentRuntimeHomePruneResult,
  type AgentRuntimeHomeResult,
  AgentRuntimeHomeService,
} from './AgentRuntimeHomeService';
import { resolveSourceCodexHome } from './CodexHomePaths';
import {
  type CodexWorkspaceSessionHistoryScope,
  migrateCodexWorkspaceSessionHistory,
} from './CodexWorkspaceSessionHistory';

export type CodexRuntimeHomeResult = AgentRuntimeHomeResult;

export interface CodexRuntimeHomeOptions {
  sessionHistoryPath: string;
  sessionHistoryScope: CodexWorkspaceSessionHistoryScope;
  legacySessionPaths?: readonly string[];
}

const SAFE_SHARED_CODEX_ENTRIES = [
  'AGENTS.md',
  'agents',
  'auth.json',
  'bin',
  'config.toml',
  'installation_id',
  'memories',
  'plugins',
  'prompts',
  'rules',
  'skills',
  'skills.disabled',
  'vendor_imports',
  'version.json',
] as const;

function resolveSymlinkTarget(linkPath: string, linkValue: string): string {
  return path.resolve(path.dirname(linkPath), linkValue);
}

function resolveLegacyRuntimeSessionsPath(runtimeSessionsPath: string): string {
  const basePath = `${runtimeSessionsPath}.legacy-${Date.now()}`;
  let candidatePath = basePath;
  let suffix = 1;

  while (existsSync(candidatePath)) {
    candidatePath = `${basePath}-${suffix}`;
    suffix += 1;
  }

  return candidatePath;
}

function ensureWorkspaceCodexRuntimeSessions(
  sessionHistoryPath: string,
  runtimeHomePath: string
): void {
  const runtimeSessionsPath = path.join(runtimeHomePath, 'sessions');

  mkdirSync(sessionHistoryPath, { recursive: true });

  if (existsSync(runtimeSessionsPath)) {
    const runtimeSessionsStat = lstatSync(runtimeSessionsPath);
    if (runtimeSessionsStat.isSymbolicLink()) {
      const linkedTarget = resolveSymlinkTarget(
        runtimeSessionsPath,
        readlinkSync(runtimeSessionsPath)
      );
      if (linkedTarget === path.resolve(sessionHistoryPath)) {
        return;
      }
      unlinkSync(runtimeSessionsPath);
    } else if (runtimeSessionsStat.isDirectory()) {
      renameSync(runtimeSessionsPath, resolveLegacyRuntimeSessionsPath(runtimeSessionsPath));
    } else {
      throw new Error(`Unexpected Codex sessions path: ${runtimeSessionsPath}`);
    }
  }

  const symlinkType = process.platform === 'win32' ? 'junction' : undefined;
  symlinkSync(sessionHistoryPath, runtimeSessionsPath, symlinkType);
}

function ensureSharedCodexMarketplaceSnapshots(
  sourceHomePath: string,
  runtimeHomePath: string
): void {
  const sourceMarketplacesPath = path.join(sourceHomePath, '.tmp', 'marketplaces');
  if (!existsSync(sourceMarketplacesPath)) {
    return;
  }

  const runtimeMarketplacesPath = path.join(runtimeHomePath, '.tmp', 'marketplaces');
  mkdirSync(path.dirname(runtimeMarketplacesPath), { recursive: true });

  if (existsSync(runtimeMarketplacesPath)) {
    const runtimeMarketplacesStat = lstatSync(runtimeMarketplacesPath);
    if (runtimeMarketplacesStat.isSymbolicLink()) {
      const linkedTarget = resolveSymlinkTarget(
        runtimeMarketplacesPath,
        readlinkSync(runtimeMarketplacesPath)
      );
      if (linkedTarget === path.resolve(sourceMarketplacesPath)) {
        return;
      }
      unlinkSync(runtimeMarketplacesPath);
    } else if (runtimeMarketplacesStat.isDirectory()) {
      if (readdirSync(runtimeMarketplacesPath).length > 0) {
        return;
      }
      rmSync(runtimeMarketplacesPath, { recursive: true, force: true });
    } else {
      return;
    }
  }

  const symlinkType = process.platform === 'win32' ? 'junction' : undefined;
  symlinkSync(sourceMarketplacesPath, runtimeMarketplacesPath, symlinkType);
}

export class CodexRuntimeHomeService {
  private delegate: AgentRuntimeHomeService | null = null;
  private readonly workspaceMigrationLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly sourceHomePath?: string,
    private readonly runtimeRootPath = path.join(getSharedRootPath(), 'codex-runtime-homes')
  ) {}

  private getDelegate(): AgentRuntimeHomeService {
    if (!this.delegate) {
      this.delegate = new AgentRuntimeHomeService({
        sourceHomePath: this.sourceHomePath ?? resolveSourceCodexHome(),
        runtimeRootPath: this.runtimeRootPath,
        sharedEntryNames: SAFE_SHARED_CODEX_ENTRIES,
      });
    }

    return this.delegate;
  }

  private collectRuntimeSessionPaths(): string[] {
    if (!existsSync(this.runtimeRootPath)) {
      return [];
    }

    try {
      return readdirSync(this.runtimeRootPath, { withFileTypes: true }).flatMap((entry) => {
        if (!entry.isDirectory() || entry.isSymbolicLink()) {
          return [];
        }

        const runtimeHomePath = path.join(this.runtimeRootPath, entry.name);
        try {
          return readdirSync(runtimeHomePath, { withFileTypes: true })
            .filter(
              (runtimeEntry) =>
                runtimeEntry.name === 'sessions' || runtimeEntry.name.startsWith('sessions.legacy-')
            )
            .map((runtimeEntry) => path.join(runtimeHomePath, runtimeEntry.name));
        } catch {
          return [];
        }
      });
    } catch {
      return [];
    }
  }

  private async runWorkspaceMigration<T>(
    sessionHistoryPath: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const lockKey = path.resolve(sessionHistoryPath);
    const previousLock = this.workspaceMigrationLocks.get(lockKey) ?? Promise.resolve();
    let releaseCurrentLock: () => void = () => undefined;
    const currentLock = new Promise<void>((resolve) => {
      releaseCurrentLock = resolve;
    });
    const trackedLock = previousLock.catch(() => undefined).then(() => currentLock);
    this.workspaceMigrationLocks.set(lockKey, trackedLock);

    await previousLock.catch(() => undefined);
    try {
      return await operation();
    } finally {
      releaseCurrentLock();
      if (this.workspaceMigrationLocks.get(lockKey) === trackedLock) {
        this.workspaceMigrationLocks.delete(lockKey);
      }
    }
  }

  async prepareRuntimeHome(
    runtimeKey: string,
    options: CodexRuntimeHomeOptions
  ): Promise<CodexRuntimeHomeResult> {
    const runtimeHome = this.getDelegate().prepareRuntimeHome(runtimeKey);
    ensureSharedCodexMarketplaceSnapshots(runtimeHome.sourceHomePath, runtimeHome.homePath);
    await this.runWorkspaceMigration(options.sessionHistoryPath, async () => {
      await migrateCodexWorkspaceSessionHistory({
        sessionHistoryPath: options.sessionHistoryPath,
        sourceSessionsPaths: [
          ...(options.legacySessionPaths ?? []),
          path.join(runtimeHome.sourceHomePath, 'sessions'),
          ...this.collectRuntimeSessionPaths(),
        ],
        worktreePath: options.sessionHistoryScope.worktreePath ?? '',
      });
    });
    ensureWorkspaceCodexRuntimeSessions(options.sessionHistoryPath, runtimeHome.homePath);
    return runtimeHome;
  }

  async runExclusive<T>(runtimeKey: string, operation: () => Promise<T> | T): Promise<T> {
    return this.getDelegate().runExclusive(runtimeKey, operation);
  }

  async releaseRuntimeHome(homePath: string): Promise<boolean> {
    return this.getDelegate().releaseRuntimeHome(homePath);
  }

  pruneOrphanedRuntimeHomes(options: AgentRuntimeHomePruneOptions): AgentRuntimeHomePruneResult {
    return this.getDelegate().pruneOrphanedRuntimeHomes(options);
  }
}

export const codexRuntimeHomeService = new CodexRuntimeHomeService();
