import type { Stats } from 'node:fs';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import path from 'node:path';
import log from '../../utils/logger';
import { getSharedRootPath } from '../SharedSessionState';
import {
  type AgentRuntimeHomePruneOptions,
  type AgentRuntimeHomePruneResult,
  type AgentRuntimeHomeResult,
  AgentRuntimeHomeService,
} from './AgentRuntimeHomeService';
import { importCodexExternalSessions } from './CodexExternalSessionImport';
import { resolveSourceCodexHome } from './CodexHomePaths';
import {
  CodexWorkspaceHistoryMigrationCoordinator,
  type CodexWorkspaceHistoryMigrationScheduler,
} from './CodexWorkspaceHistoryMigrationCoordinator';
import {
  type CodexWorkspaceSessionHistoryScope,
  listLegacyCodexWorkspaceSessionHistoryPaths,
  migrateCodexWorkspaceSessionHistory,
} from './CodexWorkspaceSessionHistory';

export type CodexRuntimeHomeResult = AgentRuntimeHomeResult & { sqliteHomePath: string };

export interface CodexRuntimeHomeOptions {
  sessionHistoryPath: string;
  sessionHistoryScope: CodexWorkspaceSessionHistoryScope;
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

function readWorkspacePathStat(targetPath: string): Stats | null {
  try {
    return lstatSync(targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function requireRegularWorkspaceDirectory(targetPath: string, label: string): Stats | null {
  const stat = readWorkspacePathStat(targetPath);
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) {
    throw new Error(`${label} must not be a symlink or non-directory`);
  }
  return stat;
}

interface WorkspaceHistoryDirectoryIdentity {
  historyRoot: Stats;
  workspaceParent: Stats;
}

function verifyWorkspaceHistoryDirectories(
  sessionHistoryPath: string,
  expected: WorkspaceHistoryDirectoryIdentity
): void {
  const workspaceParent = path.dirname(sessionHistoryPath);
  const historyRoot = path.dirname(workspaceParent);
  const actualRoot = requireRegularWorkspaceDirectory(historyRoot, 'Codex workspace history root');
  const actualParent = requireRegularWorkspaceDirectory(
    workspaceParent,
    'Codex workspace history parent'
  );
  if (
    !actualRoot ||
    !actualParent ||
    actualRoot.dev !== expected.historyRoot.dev ||
    actualRoot.ino !== expected.historyRoot.ino ||
    actualParent.dev !== expected.workspaceParent.dev ||
    actualParent.ino !== expected.workspaceParent.ino ||
    path.dirname(realpathSync(workspaceParent)) !== realpathSync(historyRoot)
  ) {
    throw new Error('Codex workspace history parent changed during preparation');
  }
  requireRegularWorkspaceDirectory(sessionHistoryPath, 'Codex workspace session history');
  requireRegularWorkspaceDirectory(
    path.join(workspaceParent, 'sqlite'),
    'Codex worktree SQLite directory'
  );
}

function ensureSafeWorkspaceHistoryDirectories(
  sessionHistoryPath: string
): WorkspaceHistoryDirectoryIdentity {
  const workspaceParent = path.dirname(sessionHistoryPath);
  const historyRoot = path.dirname(workspaceParent);
  const sqliteHomePath = path.join(workspaceParent, 'sqlite');
  const originalRoot = requireRegularWorkspaceDirectory(
    historyRoot,
    'Codex workspace history root'
  );
  const originalParent = requireRegularWorkspaceDirectory(
    workspaceParent,
    'Codex workspace history parent'
  );
  requireRegularWorkspaceDirectory(sessionHistoryPath, 'Codex workspace session history');
  requireRegularWorkspaceDirectory(sqliteHomePath, 'Codex worktree SQLite directory');

  mkdirSync(workspaceParent, { recursive: true });
  const preparedRoot = requireRegularWorkspaceDirectory(
    historyRoot,
    'Codex workspace history root'
  );
  const preparedParent = requireRegularWorkspaceDirectory(
    workspaceParent,
    'Codex workspace history parent'
  );
  if (
    !preparedParent ||
    !preparedRoot ||
    (originalRoot &&
      (preparedRoot.dev !== originalRoot.dev || preparedRoot.ino !== originalRoot.ino)) ||
    (originalParent &&
      (preparedParent.dev !== originalParent.dev || preparedParent.ino !== originalParent.ino)) ||
    path.dirname(realpathSync(workspaceParent)) !== realpathSync(historyRoot)
  ) {
    throw new Error('Codex workspace history parent changed during preparation');
  }
  requireRegularWorkspaceDirectory(sessionHistoryPath, 'Codex workspace session history');
  requireRegularWorkspaceDirectory(sqliteHomePath, 'Codex worktree SQLite directory');
  return { historyRoot: preparedRoot, workspaceParent: preparedParent };
}

function ensureWorkspaceCodexRuntimeSessions(
  sessionHistoryPath: string,
  runtimeHomePath: string,
  expected: WorkspaceHistoryDirectoryIdentity
): string | null {
  const runtimeSessionsPath = path.join(runtimeHomePath, 'sessions');
  let legacySessionsPath: string | null = null;

  verifyWorkspaceHistoryDirectories(sessionHistoryPath, expected);
  mkdirSync(sessionHistoryPath, { recursive: true });
  verifyWorkspaceHistoryDirectories(sessionHistoryPath, expected);

  if (existsSync(runtimeSessionsPath)) {
    const runtimeSessionsStat = lstatSync(runtimeSessionsPath);
    if (runtimeSessionsStat.isSymbolicLink()) {
      const linkedTarget = resolveSymlinkTarget(
        runtimeSessionsPath,
        readlinkSync(runtimeSessionsPath)
      );
      if (linkedTarget === path.resolve(sessionHistoryPath)) {
        return null;
      }
      unlinkSync(runtimeSessionsPath);
    } else if (runtimeSessionsStat.isDirectory()) {
      legacySessionsPath = resolveLegacyRuntimeSessionsPath(runtimeSessionsPath);
      renameSync(runtimeSessionsPath, legacySessionsPath);
    } else {
      throw new Error(`Unexpected Codex sessions path: ${runtimeSessionsPath}`);
    }
  }

  const symlinkType = process.platform === 'win32' ? 'junction' : undefined;
  symlinkSync(sessionHistoryPath, runtimeSessionsPath, symlinkType);
  return legacySessionsPath;
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

function isPathWithin(rootPath: string, targetPath: string): boolean {
  const relativePath = path.relative(rootPath, targetPath);
  return (
    relativePath === '' ||
    (!relativePath.startsWith(`..${path.sep}`) &&
      relativePath !== '..' &&
      !path.isAbsolute(relativePath))
  );
}

export class CodexRuntimeHomeService {
  private delegate: AgentRuntimeHomeService | null = null;

  constructor(
    private readonly sourceHomePath?: string,
    private readonly runtimeRootPath = path.join(getSharedRootPath(), 'codex-runtime-homes'),
    private readonly migrationCoordinator: CodexWorkspaceHistoryMigrationScheduler = new CodexWorkspaceHistoryMigrationCoordinator(
      {
        onError: (error) => {
          log.error('[CodexRuntimeHomeService] Failed to migrate legacy session history', error);
        },
      }
    )
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

  private collectLegacyRuntimeSessionPaths(sessionHistoryPath: string): string[] {
    const historyRootPath = path.resolve(path.dirname(path.dirname(sessionHistoryPath)));

    if (!existsSync(this.runtimeRootPath)) {
      return [];
    }

    try {
      const runtimeSessionPaths = readdirSync(this.runtimeRootPath, {
        withFileTypes: true,
      }).flatMap((entry) => {
        if (!entry.isDirectory() || entry.isSymbolicLink()) {
          return [];
        }

        const runtimeHomePath = path.join(this.runtimeRootPath, entry.name);
        try {
          return readdirSync(runtimeHomePath, { withFileTypes: true }).flatMap((runtimeEntry) => {
            const runtimeSessionPath = path.join(runtimeHomePath, runtimeEntry.name);
            if (runtimeEntry.name.startsWith('sessions.legacy-')) {
              return runtimeEntry.isDirectory() && !runtimeEntry.isSymbolicLink()
                ? [runtimeSessionPath]
                : [];
            }
            if (runtimeEntry.name !== 'sessions') {
              return [];
            }
            if (runtimeEntry.isSymbolicLink()) {
              const linkedTarget = resolveSymlinkTarget(
                runtimeSessionPath,
                readlinkSync(runtimeSessionPath)
              );
              return isPathWithin(historyRootPath, linkedTarget) ? [linkedTarget] : [];
            }

            return runtimeEntry.isDirectory() ? [runtimeSessionPath] : [];
          });
        } catch {
          return [];
        }
      });
      return runtimeSessionPaths;
    } catch {
      return [];
    }
  }

  private scheduleWorkspaceMigration(
    options: CodexRuntimeHomeOptions,
    currentRuntimeLegacySessionPaths: readonly string[]
  ): void {
    const sessionHistoryPath = options.sessionHistoryPath;
    void this.migrationCoordinator.schedule(path.resolve(sessionHistoryPath), async () => {
      const legacyWorkspaceSessionPaths =
        await listLegacyCodexWorkspaceSessionHistoryPaths(sessionHistoryPath);
      await migrateCodexWorkspaceSessionHistory({
        sessionHistoryPath,
        sourceSessionsPaths: [
          ...currentRuntimeLegacySessionPaths,
          ...this.collectLegacyRuntimeSessionPaths(sessionHistoryPath),
          ...legacyWorkspaceSessionPaths,
        ],
        worktreePath: options.sessionHistoryScope.worktreePath ?? '',
      });
    });
  }

  async prepareRuntimeHome(
    runtimeKey: string,
    options: CodexRuntimeHomeOptions
  ): Promise<CodexRuntimeHomeResult> {
    const historyDirectoryIdentity = ensureSafeWorkspaceHistoryDirectories(
      options.sessionHistoryPath
    );
    const runtimeHome = this.getDelegate().prepareRuntimeHome(runtimeKey);
    verifyWorkspaceHistoryDirectories(options.sessionHistoryPath, historyDirectoryIdentity);
    ensureSharedCodexMarketplaceSnapshots(runtimeHome.sourceHomePath, runtimeHome.homePath);
    const migratedRuntimeSessionPath = ensureWorkspaceCodexRuntimeSessions(
      options.sessionHistoryPath,
      runtimeHome.homePath,
      historyDirectoryIdentity
    );
    const sqliteHomePath = path.join(path.dirname(options.sessionHistoryPath), 'sqlite');
    verifyWorkspaceHistoryDirectories(options.sessionHistoryPath, historyDirectoryIdentity);
    mkdirSync(sqliteHomePath, { recursive: true });
    verifyWorkspaceHistoryDirectories(options.sessionHistoryPath, historyDirectoryIdentity);
    try {
      const result = await importCodexExternalSessions({
        sessionHistoryPath: options.sessionHistoryPath,
        sourceSessionsPath: path.join(runtimeHome.sourceHomePath, 'sessions'),
        worktreePath: options.sessionHistoryScope.worktreePath ?? '',
      });
      if (result.retryableFailures > 0) {
        log.warn(
          `[CodexRuntimeHomeService] ${result.retryableFailures} external transcript imports deferred; initial resume list may be incomplete. Retry on next launch.`
        );
      }
    } catch {
      log.warn(
        '[CodexRuntimeHomeService] External transcript import failed; initial resume list may be incomplete. Retry on next launch.'
      );
    }
    this.scheduleWorkspaceMigration(
      options,
      migratedRuntimeSessionPath ? [migratedRuntimeSessionPath] : []
    );
    return { ...runtimeHome, sqliteHomePath };
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
