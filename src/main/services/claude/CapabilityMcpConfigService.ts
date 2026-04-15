import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ClaudeCapabilitySourceScope, McpServerConfig } from '@shared/types';
import { isRemoteVirtualPath, parseRemoteVirtualPath } from '@shared/utils/remotePath';
import {
  getRepositoryEnvironmentContext,
  readRepositoryClaudeJson,
  readRepositoryRemoteTextFile,
} from '../remote/RemoteEnvironmentService';
import { parseCodexMcpRecord } from './CodexMcpToml';

interface ClaudeProjectState {
  mcpServers?: Record<string, McpServerConfig>;
  [key: string]: unknown;
}

interface ClaudeJsonProjects {
  mcpServers?: Record<string, McpServerConfig>;
  projects?: Record<string, ClaudeProjectState>;
  [key: string]: unknown;
}

export interface CapabilityMcpConfigEntry {
  id: string;
  config: McpServerConfig;
  sourceScope: ClaudeCapabilitySourceScope;
  sourcePath?: string;
}

export interface CapabilityMcpConfigSet {
  sharedById: Record<string, CapabilityMcpConfigEntry>;
  personalById: Record<string, CapabilityMcpConfigEntry>;
}

export interface CapabilityMcpConfigServiceDependencies {
  readLocalClaudeJson?: () => Promise<ClaudeJsonProjects | null>;
  readLocalProjectSettings?: (workspacePath: string) => Promise<ClaudeProjectState | null>;
  getRepositoryEnvironmentContext?: typeof getRepositoryEnvironmentContext;
  readRepositoryRemoteTextFile?: typeof readRepositoryRemoteTextFile;
  readRepositoryClaudeJson?: typeof readRepositoryClaudeJson;
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

async function defaultReadLocalClaudeJson(): Promise<ClaudeJsonProjects | null> {
  return readJsonFileSafe<ClaudeJsonProjects>(path.join(os.homedir(), '.claude.json'));
}

async function defaultReadLocalProjectSettings(
  workspacePath: string
): Promise<ClaudeProjectState | null> {
  const data = await defaultReadLocalClaudeJson();
  if (!data?.projects || typeof data.projects !== 'object') {
    return null;
  }

  const normalizedWorkspacePath = path.normalize(workspacePath);
  for (const [candidatePath, settings] of Object.entries(data.projects)) {
    if (path.normalize(candidatePath) === normalizedWorkspacePath) {
      return settings ?? null;
    }
  }

  return null;
}

function normalizeRemoteWorkspacePath(workspacePath: string): string {
  return parseRemoteVirtualPath(workspacePath).remotePath;
}

function toRemotePath(inputPath: string): string {
  return inputPath.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
}

function readRemoteProjectSettings(
  workspacePath: string,
  claudeJson: Record<string, unknown> | null
): ClaudeProjectState | null {
  const projects = claudeJson?.projects;
  if (!projects || typeof projects !== 'object' || Array.isArray(projects)) {
    return null;
  }

  const normalizedWorkspacePath = toRemotePath(workspacePath);
  for (const [candidatePath, settings] of Object.entries(projects)) {
    if (toRemotePath(candidatePath) === normalizedWorkspacePath) {
      return (settings as ClaudeProjectState) ?? null;
    }
  }

  return null;
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
  const data = await readJsonFileSafe<Record<string, unknown>>(
    path.join(workspacePath, '.mcp.json')
  );
  const sourcePath = path.join(workspacePath, '.mcp.json');

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
  readLocalClaudeJsonFn: () => Promise<ClaudeJsonProjects | null>
): Promise<CapabilityMcpConfigEntry[]> {
  const data = await readLocalClaudeJsonFn();
  const sourcePath = path.join(os.homedir(), '.claude.json');

  return Object.entries(data?.mcpServers ?? {}).map(([id, config]) => ({
    id,
    config,
    sourceScope: 'user',
    sourcePath,
  }));
}

async function readLocalWorkspacePersonalEntries(
  workspacePath: string,
  readLocalProjectSettingsFn: (workspacePath: string) => Promise<ClaudeProjectState | null>,
  sourceScope: ClaudeCapabilitySourceScope
): Promise<CapabilityMcpConfigEntry[]> {
  const settings = await readLocalProjectSettingsFn(workspacePath);
  const sourcePath = path.join(os.homedir(), '.claude.json');

  return Object.entries(settings?.mcpServers ?? {}).map(([id, config]) => ({
    id,
    config,
    sourceScope,
    sourcePath,
  }));
}

function readRemoteGlobalPersonalEntries(
  claudeJson: Record<string, unknown> | null,
  sourcePath: string
): CapabilityMcpConfigEntry[] {
  return Object.entries(normalizeMcpRecord(claudeJson)).map(([id, config]) => ({
    id,
    config,
    sourceScope: 'remote',
    sourcePath,
  }));
}

function readRemoteWorkspacePersonalEntries(
  workspacePath: string,
  claudeJson: Record<string, unknown> | null
): CapabilityMcpConfigEntry[] {
  const settings = readRemoteProjectSettings(workspacePath, claudeJson);

  return Object.entries(settings?.mcpServers ?? {}).map(([id, config]) => ({
    id,
    config,
    sourceScope: 'remote',
    sourcePath: workspacePath,
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
  readRemoteTextFile: typeof readRepositoryRemoteTextFile
): Promise<CapabilityMcpConfigEntry[]> {
  const content = await readRemoteTextFile(repoPath, configPath);

  return Object.entries(parseCodexMcpRecord(content)).map(([id, config]) => ({
    id,
    config,
    sourceScope: 'remote',
    sourcePath: configPath,
  }));
}

export async function resolveCapabilityMcpConfigEntries(
  params: { repoPath?: string; worktreePath?: string },
  dependencies: CapabilityMcpConfigServiceDependencies = {}
): Promise<CapabilityMcpConfigSet> {
  const { repoPath, worktreePath } = params;
  const sharedEntries: CapabilityMcpConfigEntry[] = [];
  const personalEntries: CapabilityMcpConfigEntry[] = [];
  const readLocalClaudeJsonFn = dependencies.readLocalClaudeJson ?? defaultReadLocalClaudeJson;
  const readLocalProjectSettingsFn =
    dependencies.readLocalProjectSettings ?? defaultReadLocalProjectSettings;
  const getRemoteContext =
    dependencies.getRepositoryEnvironmentContext ?? getRepositoryEnvironmentContext;
  const readRemoteTextFile =
    dependencies.readRepositoryRemoteTextFile ?? readRepositoryRemoteTextFile;
  const readRemoteClaudeJson = dependencies.readRepositoryClaudeJson ?? readRepositoryClaudeJson;

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

      const remoteClaudeJson = await readRemoteClaudeJson(repoPath);
      personalEntries.push(
        ...readRemoteGlobalPersonalEntries(remoteClaudeJson, context.claudeJsonPath),
        ...readRemoteWorkspacePersonalEntries(normalizedRepoPath, remoteClaudeJson),
        ...(await readRemoteCodexPersonalEntries(
          repoPath,
          `${toRemotePath(context.homeDir)}/.codex/config.toml`,
          readRemoteTextFile
        )),
        ...(await readRemoteCodexPersonalEntries(
          repoPath,
          `${normalizedRepoPath}/.codex/config.toml`,
          readRemoteTextFile
        ))
      );

      if (worktreePath && isRemoteVirtualPath(worktreePath) && worktreePath !== repoPath) {
        personalEntries.push(
          ...readRemoteWorkspacePersonalEntries(
            normalizeRemoteWorkspacePath(worktreePath),
            remoteClaudeJson
          ),
          ...(await readRemoteCodexPersonalEntries(
            repoPath,
            `${normalizeRemoteWorkspacePath(worktreePath)}/.codex/config.toml`,
            readRemoteTextFile
          ))
        );
      }
    }
  } else {
    personalEntries.push(
      ...(await readLocalGlobalPersonalEntries(readLocalClaudeJsonFn)),
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
          readLocalProjectSettingsFn,
          'project'
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
          readLocalProjectSettingsFn,
          'worktree'
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
