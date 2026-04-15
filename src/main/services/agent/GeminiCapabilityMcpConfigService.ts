import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ClaudeCapabilitySourceScope, McpServerConfig } from '@shared/types';
import { isRemoteVirtualPath, parseRemoteVirtualPath } from '@shared/utils/remotePath';
import type {
  CapabilityMcpConfigEntry,
  CapabilityMcpConfigSet,
} from '../claude/CapabilityMcpConfigService';
import { parseCodexMcpRecord } from '../claude/CodexMcpToml';
import {
  getRepositoryEnvironmentContext,
  readRepositoryRemoteTextFile,
} from '../remote/RemoteEnvironmentService';

interface GeminiSettings {
  mcpServers?: Record<string, McpServerConfig>;
  [key: string]: unknown;
}

export interface GeminiCapabilityMcpConfigServiceDependencies {
  readLocalGeminiSettings?: () => Promise<GeminiSettings | null>;
  readLocalGeminiWorkspaceSettings?: (workspacePath: string) => Promise<GeminiSettings | null>;
  getRepositoryEnvironmentContext?: typeof getRepositoryEnvironmentContext;
  readRepositoryRemoteTextFile?: typeof readRepositoryRemoteTextFile;
}

const SOURCE_SCOPE_PRECEDENCE: Record<ClaudeCapabilitySourceScope, number> = {
  system: 0,
  user: 1,
  project: 2,
  worktree: 3,
  remote: 4,
};

async function readTextFileSafe(filePath: string): Promise<string | null> {
  try {
    return await fs.promises.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

async function readJsonFileSafe<T>(filePath: string): Promise<T | null> {
  const content = await readTextFileSafe(filePath);
  if (!content?.trim()) {
    return null;
  }

  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

function normalizeMcpRecord(value: unknown): Record<string, McpServerConfig> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const container = value as Record<string, unknown>;
  const servers =
    container.mcpServers &&
    typeof container.mcpServers === 'object' &&
    !Array.isArray(container.mcpServers)
      ? (container.mcpServers as Record<string, McpServerConfig>)
      : (container as Record<string, McpServerConfig>);

  return servers ?? {};
}

async function defaultReadLocalGeminiSettings(): Promise<GeminiSettings | null> {
  return readJsonFileSafe<GeminiSettings>(path.join(os.homedir(), '.gemini', 'settings.json'));
}

async function defaultReadLocalGeminiWorkspaceSettings(
  workspacePath: string
): Promise<GeminiSettings | null> {
  return readJsonFileSafe<GeminiSettings>(path.join(workspacePath, '.gemini', 'settings.json'));
}

function normalizeRemoteWorkspacePath(workspacePath: string): string {
  return parseRemoteVirtualPath(workspacePath).remotePath;
}

function toRemotePath(inputPath: string): string {
  return inputPath.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
}

function dedupeConfigEntries(
  entries: CapabilityMcpConfigEntry[]
): Record<string, CapabilityMcpConfigEntry> {
  const byId = new Map<string, CapabilityMcpConfigEntry>();

  for (const entry of entries) {
    const existing = byId.get(entry.id);
    if (
      !existing ||
      SOURCE_SCOPE_PRECEDENCE[entry.sourceScope] >= SOURCE_SCOPE_PRECEDENCE[existing.sourceScope]
    ) {
      byId.set(entry.id, entry);
    }
  }

  return Object.fromEntries(
    [...byId.entries()].sort(([left], [right]) => left.localeCompare(right))
  );
}

async function readLocalSharedEntries(
  workspacePath: string,
  sourceScope: ClaudeCapabilitySourceScope
): Promise<CapabilityMcpConfigEntry[]> {
  const sourcePath = path.join(workspacePath, '.mcp.json');
  const data = await readJsonFileSafe<Record<string, unknown>>(sourcePath);

  return Object.entries(normalizeMcpRecord(data)).map(([id, config]) => ({
    id,
    config,
    sourceScope,
    sourcePath,
  }));
}

async function readRemoteSharedEntries(
  repoPath: string,
  workspacePath: string,
  readRemoteTextFile: typeof readRepositoryRemoteTextFile
): Promise<CapabilityMcpConfigEntry[]> {
  const sourcePath = `${toRemotePath(workspacePath)}/.mcp.json`;
  const content = await readRemoteTextFile(repoPath, sourcePath);
  if (!content?.trim()) {
    return [];
  }

  let data: Record<string, unknown> | null = null;
  try {
    data = JSON.parse(content) as Record<string, unknown>;
  } catch {
    data = null;
  }

  return Object.entries(normalizeMcpRecord(data)).map(([id, config]) => ({
    id,
    config,
    sourceScope: 'remote',
    sourcePath,
  }));
}

async function readLocalGlobalPersonalEntries(
  readLocalGeminiSettingsFn: () => Promise<GeminiSettings | null>
): Promise<CapabilityMcpConfigEntry[]> {
  const sourcePath = path.join(os.homedir(), '.gemini', 'settings.json');
  const data = await readLocalGeminiSettingsFn();

  return Object.entries(data?.mcpServers ?? {}).map(([id, config]) => ({
    id,
    config,
    sourceScope: 'user',
    sourcePath,
  }));
}

async function readLocalWorkspacePersonalEntries(
  workspacePath: string,
  sourceScope: ClaudeCapabilitySourceScope,
  readLocalGeminiWorkspaceSettingsFn: (workspacePath: string) => Promise<GeminiSettings | null>
): Promise<CapabilityMcpConfigEntry[]> {
  const sourcePath = path.join(workspacePath, '.gemini', 'settings.json');
  const settings = await readLocalGeminiWorkspaceSettingsFn(workspacePath);

  return Object.entries(settings?.mcpServers ?? {}).map(([id, config]) => ({
    id,
    config,
    sourceScope,
    sourcePath,
  }));
}

async function readRemoteGeminiSettings(
  repoPath: string,
  settingsPath: string,
  readRemoteTextFile: typeof readRepositoryRemoteTextFile
): Promise<GeminiSettings | null> {
  const content = await readRemoteTextFile(repoPath, settingsPath);
  if (!content?.trim()) {
    return null;
  }

  try {
    return JSON.parse(content) as GeminiSettings;
  } catch {
    return null;
  }
}

function createRemotePersonalEntries(
  settings: GeminiSettings | null,
  sourceScope: ClaudeCapabilitySourceScope,
  sourcePath: string
): CapabilityMcpConfigEntry[] {
  return Object.entries(settings?.mcpServers ?? {}).map(([id, config]) => ({
    id,
    config,
    sourceScope,
    sourcePath,
  }));
}

async function readLocalCodexPersonalEntries(
  configPath: string,
  sourceScope: ClaudeCapabilitySourceScope
): Promise<CapabilityMcpConfigEntry[]> {
  const content = await readTextFileSafe(configPath);

  return Object.entries(parseCodexMcpRecord(content)).map(([id, config]) => ({
    id,
    config,
    sourceScope,
    sourcePath: configPath,
  }));
}

async function readRemoteCodexPersonalEntries(
  repoPath: string,
  configPath: string,
  sourceScope: ClaudeCapabilitySourceScope,
  readRemoteTextFile: typeof readRepositoryRemoteTextFile
): Promise<CapabilityMcpConfigEntry[]> {
  const content = await readRemoteTextFile(repoPath, configPath);

  return Object.entries(parseCodexMcpRecord(content)).map(([id, config]) => ({
    id,
    config,
    sourceScope,
    sourcePath: configPath,
  }));
}

export async function resolveGeminiCapabilityMcpConfigEntries(
  params: { repoPath?: string; worktreePath?: string },
  dependencies: GeminiCapabilityMcpConfigServiceDependencies = {}
): Promise<CapabilityMcpConfigSet> {
  const { repoPath, worktreePath } = params;
  const sharedEntries: CapabilityMcpConfigEntry[] = [];
  const personalEntries: CapabilityMcpConfigEntry[] = [];
  const readLocalGeminiSettingsFn =
    dependencies.readLocalGeminiSettings ?? defaultReadLocalGeminiSettings;
  const readLocalGeminiWorkspaceSettingsFn =
    dependencies.readLocalGeminiWorkspaceSettings ?? defaultReadLocalGeminiWorkspaceSettings;
  const getRemoteContext =
    dependencies.getRepositoryEnvironmentContext ?? getRepositoryEnvironmentContext;
  const readRemoteTextFile =
    dependencies.readRepositoryRemoteTextFile ?? readRepositoryRemoteTextFile;

  if (repoPath && isRemoteVirtualPath(repoPath)) {
    const context = await getRemoteContext(repoPath);
    if (context.kind === 'remote') {
      const normalizedRepoPath = normalizeRemoteWorkspacePath(repoPath);
      sharedEntries.push(
        ...(await readRemoteSharedEntries(repoPath, normalizedRepoPath, readRemoteTextFile))
      );

      if (worktreePath && isRemoteVirtualPath(worktreePath) && worktreePath !== repoPath) {
        sharedEntries.push(
          ...(await readRemoteSharedEntries(
            repoPath,
            normalizeRemoteWorkspacePath(worktreePath),
            readRemoteTextFile
          ))
        );
      }

      personalEntries.push(
        ...createRemotePersonalEntries(
          await readRemoteGeminiSettings(
            repoPath,
            `${toRemotePath(context.homeDir)}/.gemini/settings.json`,
            readRemoteTextFile
          ),
          'user',
          `${toRemotePath(context.homeDir)}/.gemini/settings.json`
        ),
        ...(await readRemoteCodexPersonalEntries(
          repoPath,
          `${toRemotePath(context.homeDir)}/.codex/config.toml`,
          'user',
          readRemoteTextFile
        ))
      );

      personalEntries.push(
        ...createRemotePersonalEntries(
          await readRemoteGeminiSettings(
            repoPath,
            `${normalizedRepoPath}/.gemini/settings.json`,
            readRemoteTextFile
          ),
          'project',
          `${normalizedRepoPath}/.gemini/settings.json`
        ),
        ...(await readRemoteCodexPersonalEntries(
          repoPath,
          `${normalizedRepoPath}/.codex/config.toml`,
          'project',
          readRemoteTextFile
        ))
      );

      if (worktreePath && isRemoteVirtualPath(worktreePath) && worktreePath !== repoPath) {
        const normalizedWorktreePath = normalizeRemoteWorkspacePath(worktreePath);
        personalEntries.push(
          ...createRemotePersonalEntries(
            await readRemoteGeminiSettings(
              repoPath,
              `${normalizedWorktreePath}/.gemini/settings.json`,
              readRemoteTextFile
            ),
            'worktree',
            `${normalizedWorktreePath}/.gemini/settings.json`
          ),
          ...(await readRemoteCodexPersonalEntries(
            repoPath,
            `${normalizedWorktreePath}/.codex/config.toml`,
            'worktree',
            readRemoteTextFile
          ))
        );
      }
    }
  } else {
    personalEntries.push(
      ...(await readLocalGlobalPersonalEntries(readLocalGeminiSettingsFn)),
      ...(await readLocalCodexPersonalEntries(
        path.join(os.homedir(), '.codex', 'config.toml'),
        'user'
      ))
    );

    if (repoPath) {
      sharedEntries.push(...(await readLocalSharedEntries(repoPath, 'project')));
      personalEntries.push(
        ...(await readLocalWorkspacePersonalEntries(
          repoPath,
          'project',
          readLocalGeminiWorkspaceSettingsFn
        )),
        ...(await readLocalCodexPersonalEntries(
          path.join(repoPath, '.codex', 'config.toml'),
          'project'
        ))
      );
    }

    if (worktreePath && worktreePath !== repoPath) {
      sharedEntries.push(...(await readLocalSharedEntries(worktreePath, 'worktree')));
      personalEntries.push(
        ...(await readLocalWorkspacePersonalEntries(
          worktreePath,
          'worktree',
          readLocalGeminiWorkspaceSettingsFn
        )),
        ...(await readLocalCodexPersonalEntries(
          path.join(worktreePath, '.codex', 'config.toml'),
          'worktree'
        ))
      );
    }
  }

  return {
    sharedById: dedupeConfigEntries(sharedEntries),
    personalById: dedupeConfigEntries(personalEntries),
  };
}
