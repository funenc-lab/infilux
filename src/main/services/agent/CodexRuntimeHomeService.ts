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
import log from '../../utils/logger';
import { getSharedRootPath } from '../SharedSessionState';
import {
  type AgentRuntimeHomePruneOptions,
  type AgentRuntimeHomePruneResult,
  type AgentRuntimeHomeResult,
  AgentRuntimeHomeService,
} from './AgentRuntimeHomeService';
import { resolveSourceCodexHome } from './CodexHomePaths';
import {
  CodexWorkspaceHistoryMigrationCoordinator,
  type CodexWorkspaceHistoryMigrationScheduler,
} from './CodexWorkspaceHistoryMigrationCoordinator';
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
): string | null {
  const runtimeSessionsPath = path.join(runtimeHomePath, 'sessions');
  let legacySessionsPath: string | null = null;

  mkdirSync(sessionHistoryPath, { recursive: true });

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

function collectLegacyLinkedSessionPaths(
  runtimeHomePath: string,
  sessionHistoryPath: string
): string[] {
  const runtimeSessionsPath = path.join(runtimeHomePath, 'sessions');
  if (!existsSync(runtimeSessionsPath)) {
    return [];
  }

  try {
    const runtimeSessionsStat = lstatSync(runtimeSessionsPath);
    if (!runtimeSessionsStat.isSymbolicLink()) {
      return [];
    }

    const linkedTarget = resolveSymlinkTarget(
      runtimeSessionsPath,
      readlinkSync(runtimeSessionsPath)
    );
    const historyRootPath = path.resolve(path.dirname(path.dirname(sessionHistoryPath)));
    return isPathWithin(historyRootPath, linkedTarget) ? [] : [linkedTarget];
  } catch {
    return [];
  }
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
    if (!existsSync(this.runtimeRootPath)) {
      return [];
    }

    const historyRootPath = path.resolve(path.dirname(path.dirname(sessionHistoryPath)));

    try {
      return readdirSync(this.runtimeRootPath, { withFileTypes: true }).flatMap((entry) => {
        if (!entry.isDirectory() || entry.isSymbolicLink()) {
          return [];
        }

        const runtimeHomePath = path.join(this.runtimeRootPath, entry.name);
        try {
          return readdirSync(runtimeHomePath, { withFileTypes: true }).flatMap((runtimeEntry) => {
            const runtimeSessionPath = path.join(runtimeHomePath, runtimeEntry.name);
            if (runtimeEntry.name.startsWith('sessions.legacy-')) {
              return [runtimeSessionPath];
            }
            if (runtimeEntry.name !== 'sessions') {
              return [];
            }
            if (!runtimeEntry.isSymbolicLink()) {
              return [runtimeSessionPath];
            }

            const linkedTarget = resolveSymlinkTarget(
              runtimeSessionPath,
              readlinkSync(runtimeSessionPath)
            );
            return isPathWithin(historyRootPath, linkedTarget) ? [] : [runtimeSessionPath];
          });
        } catch {
          return [];
        }
      });
    } catch {
      return [];
    }
  }

  private scheduleWorkspaceMigration(
    runtimeHome: CodexRuntimeHomeResult,
    options: CodexRuntimeHomeOptions,
    currentRuntimeLegacySessionPaths: readonly string[]
  ): void {
    const sessionHistoryPath = options.sessionHistoryPath;
    void this.migrationCoordinator.schedule(path.resolve(sessionHistoryPath), async () => {
      await migrateCodexWorkspaceSessionHistory({
        sessionHistoryPath,
        sourceSessionsPaths: [
          ...currentRuntimeLegacySessionPaths,
          ...(options.legacySessionPaths ?? []),
          path.join(runtimeHome.sourceHomePath, 'sessions'),
          ...this.collectLegacyRuntimeSessionPaths(sessionHistoryPath),
        ],
        worktreePath: options.sessionHistoryScope.worktreePath ?? '',
      });
    });
  }

  async prepareRuntimeHome(
    runtimeKey: string,
    options: CodexRuntimeHomeOptions
  ): Promise<CodexRuntimeHomeResult> {
    const runtimeHome = this.getDelegate().prepareRuntimeHome(runtimeKey);
    ensureSharedCodexMarketplaceSnapshots(runtimeHome.sourceHomePath, runtimeHome.homePath);
    const linkedLegacySessionPaths = collectLegacyLinkedSessionPaths(
      runtimeHome.homePath,
      options.sessionHistoryPath
    );
    const migratedRuntimeSessionPath = ensureWorkspaceCodexRuntimeSessions(
      options.sessionHistoryPath,
      runtimeHome.homePath
    );
    this.scheduleWorkspaceMigration(runtimeHome, options, [
      ...linkedLegacySessionPaths,
      ...(migratedRuntimeSessionPath ? [migratedRuntimeSessionPath] : []),
    ]);
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
