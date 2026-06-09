import { existsSync, lstatSync, mkdirSync, readlinkSync, symlinkSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getSharedRootPath } from '../SharedSessionState';

export interface CodexRuntimeHomeResult {
  homePath: string;
  sourceHomePath: string;
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

export class CodexRuntimeHomeService {
  constructor(
    private readonly sourceHomePath = resolveSourceCodexHome(),
    private readonly runtimeRootPath = path.join(getSharedRootPath(), 'codex-runtime-homes')
  ) {}

  prepareRuntimeHome(runtimeKey: string): CodexRuntimeHomeResult {
    const safeRuntimeKey = sanitizeRuntimeKey(runtimeKey);
    const homePath = path.join(this.runtimeRootPath, safeRuntimeKey);
    mkdirSync(homePath, { recursive: true });

    for (const entryName of SAFE_SHARED_CODEX_ENTRIES) {
      ensureLinkedEntry(path.join(this.sourceHomePath, entryName), path.join(homePath, entryName));
    }

    return {
      homePath,
      sourceHomePath: this.sourceHomePath,
    };
  }
}

export const codexRuntimeHomeService = new CodexRuntimeHomeService();
