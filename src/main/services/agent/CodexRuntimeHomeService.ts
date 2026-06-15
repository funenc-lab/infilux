import os from 'node:os';
import path from 'node:path';
import { getSharedRootPath } from '../SharedSessionState';
import {
  type AgentRuntimeHomePruneOptions,
  type AgentRuntimeHomePruneResult,
  type AgentRuntimeHomeResult,
  AgentRuntimeHomeService,
} from './AgentRuntimeHomeService';

export type CodexRuntimeHomeResult = AgentRuntimeHomeResult;

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
  'sessions',
  'skills',
  'skills.disabled',
  'vendor_imports',
  'version.json',
] as const;

function resolveSourceCodexHome(): string {
  const codexHome = process.env.CODEX_HOME?.trim();
  return codexHome || path.join(os.homedir(), '.codex');
}

export class CodexRuntimeHomeService {
  private readonly delegate: AgentRuntimeHomeService;

  constructor(
    sourceHomePath = resolveSourceCodexHome(),
    runtimeRootPath = path.join(getSharedRootPath(), 'codex-runtime-homes')
  ) {
    this.delegate = new AgentRuntimeHomeService({
      sourceHomePath,
      runtimeRootPath,
      sharedEntryNames: SAFE_SHARED_CODEX_ENTRIES,
    });
  }

  prepareRuntimeHome(runtimeKey: string): CodexRuntimeHomeResult {
    return this.delegate.prepareRuntimeHome(runtimeKey);
  }

  async runExclusive<T>(runtimeKey: string, operation: () => Promise<T> | T): Promise<T> {
    return this.delegate.runExclusive(runtimeKey, operation);
  }

  pruneOrphanedRuntimeHomes(options: AgentRuntimeHomePruneOptions): AgentRuntimeHomePruneResult {
    return this.delegate.pruneOrphanedRuntimeHomes(options);
  }
}

export const codexRuntimeHomeService = new CodexRuntimeHomeService();
