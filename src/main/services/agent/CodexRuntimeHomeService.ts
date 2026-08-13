import {
  copyFileSync,
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
import { getSharedRootPath } from '../SharedSessionState';
import {
  type AgentRuntimeHomePruneOptions,
  type AgentRuntimeHomePruneResult,
  type AgentRuntimeHomeResult,
  AgentRuntimeHomeService,
} from './AgentRuntimeHomeService';
import { resolveSourceCodexHome } from './CodexHomePaths';

export type CodexRuntimeHomeResult = AgentRuntimeHomeResult;

export interface CodexRuntimeHomeOptions {
  shareSessions?: boolean;
}

const SAFE_SHARED_CODEX_ENTRIES = [
  'AGENTS.md',
  'agents',
  'auth.json',
  'bin',
  'config.toml',
  'installation_id',
  'memories',
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

function copyMissingTreeContents(sourceDir: string, targetDir: string): void {
  if (!existsSync(sourceDir)) {
    return;
  }

  mkdirSync(targetDir, { recursive: true });

  for (const entryName of readdirSync(sourceDir)) {
    const sourcePath = path.join(sourceDir, entryName);
    const targetPath = path.join(targetDir, entryName);
    const sourceStat = lstatSync(sourcePath);

    if (sourceStat.isDirectory() && !sourceStat.isSymbolicLink()) {
      copyMissingTreeContents(sourcePath, targetPath);
      continue;
    }

    if (existsSync(targetPath)) {
      continue;
    }

    if (sourceStat.isSymbolicLink()) {
      symlinkSync(readlinkSync(sourcePath), targetPath);
      continue;
    }

    if (sourceStat.isFile()) {
      mkdirSync(path.dirname(targetPath), { recursive: true });
      copyFileSync(sourcePath, targetPath);
    }
  }
}

function ensureSharedCodexRuntimeSessions(sourceHomePath: string, runtimeHomePath: string): void {
  const sourceSessionsPath = path.join(sourceHomePath, 'sessions');
  const runtimeSessionsPath = path.join(runtimeHomePath, 'sessions');

  mkdirSync(sourceSessionsPath, { recursive: true });

  if (existsSync(runtimeSessionsPath)) {
    const runtimeSessionsStat = lstatSync(runtimeSessionsPath);
    if (runtimeSessionsStat.isSymbolicLink()) {
      const linkedTarget = resolveSymlinkTarget(
        runtimeSessionsPath,
        readlinkSync(runtimeSessionsPath)
      );
      if (linkedTarget === path.resolve(sourceSessionsPath)) {
        return;
      }
      unlinkSync(runtimeSessionsPath);
    } else if (runtimeSessionsStat.isDirectory()) {
      copyMissingTreeContents(runtimeSessionsPath, sourceSessionsPath);
      rmSync(runtimeSessionsPath, { recursive: true, force: true });
    } else {
      return;
    }
  }

  const symlinkType = process.platform === 'win32' ? 'junction' : undefined;
  symlinkSync(sourceSessionsPath, runtimeSessionsPath, symlinkType);
}

function ensureIsolatedCodexRuntimeSessions(runtimeHomePath: string): void {
  const runtimeSessionsPath = path.join(runtimeHomePath, 'sessions');

  if (existsSync(runtimeSessionsPath)) {
    const runtimeSessionsStat = lstatSync(runtimeSessionsPath);
    if (runtimeSessionsStat.isDirectory() && !runtimeSessionsStat.isSymbolicLink()) {
      return;
    }
    if (runtimeSessionsStat.isSymbolicLink()) {
      unlinkSync(runtimeSessionsPath);
    } else {
      return;
    }
  }

  mkdirSync(runtimeSessionsPath, { recursive: true });
}

export class CodexRuntimeHomeService {
  private delegate: AgentRuntimeHomeService | null = null;

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

  prepareRuntimeHome(
    runtimeKey: string,
    options: CodexRuntimeHomeOptions = {}
  ): CodexRuntimeHomeResult {
    const runtimeHome = this.getDelegate().prepareRuntimeHome(runtimeKey);
    if (options.shareSessions) {
      ensureSharedCodexRuntimeSessions(runtimeHome.sourceHomePath, runtimeHome.homePath);
    } else {
      ensureIsolatedCodexRuntimeSessions(runtimeHome.homePath);
    }
    return runtimeHome;
  }

  async runExclusive<T>(runtimeKey: string, operation: () => Promise<T> | T): Promise<T> {
    return this.getDelegate().runExclusive(runtimeKey, operation);
  }

  pruneOrphanedRuntimeHomes(options: AgentRuntimeHomePruneOptions): AgentRuntimeHomePruneResult {
    return this.getDelegate().pruneOrphanedRuntimeHomes(options);
  }
}

export const codexRuntimeHomeService = new CodexRuntimeHomeService();
