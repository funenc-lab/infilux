import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  ClaudeCapabilityCatalog,
  ClaudeCapabilityCatalogItem,
  ClaudeCapabilitySourceScope,
  ClaudeMcpCatalogItem,
  McpServerConfig,
} from '@shared/types';
import { isHttpMcpConfig } from '@shared/types';
import { isRemoteVirtualPath, parseRemoteVirtualPath } from '@shared/utils/remotePath';
import { remoteConnectionManager } from '../remote/RemoteConnectionManager';
import {
  getRepositoryEnvironmentContext,
  listRepositoryRemoteDirectory,
  readRepositoryClaudeJson,
} from '../remote/RemoteEnvironmentService';
import { parseCodexMcpRecord } from './CodexMcpToml';

const BUILTIN_COMMANDS: Array<{ id: string; name: string; description: string }> = [
  { id: 'help', name: 'Help', description: 'Show command help' },
  { id: 'clear', name: 'Clear', description: 'Clear the current view' },
  { id: 'compact', name: 'Compact', description: 'Compact the active context' },
  { id: 'review', name: 'Review', description: 'Start the review flow' },
];

interface ClaudeProjectState {
  mcpServers?: Record<string, McpServerConfig>;
  [key: string]: unknown;
}

interface ClaudeJsonProjects {
  mcpServers?: Record<string, McpServerConfig>;
  projects?: Record<string, ClaudeProjectState>;
  [key: string]: unknown;
}

interface GeminiSettings {
  mcpServers?: Record<string, McpServerConfig>;
  [key: string]: unknown;
}

export interface CapabilityCatalogServiceDependencies {
  getUserClaudeConfigDirs?: () => string[];
  readLocalClaudeJson?: () => Promise<ClaudeJsonProjects | null>;
  readLocalProjectSettings?: (workspacePath: string) => Promise<ClaudeProjectState | null>;
  readLocalGeminiSettings?: () => Promise<GeminiSettings | null>;
  readLocalGeminiProjectSettings?: (workspacePath: string) => Promise<GeminiSettings | null>;
  getRepositoryEnvironmentContext?: typeof getRepositoryEnvironmentContext;
  listRepositoryRemoteDirectory?: typeof listRepositoryRemoteDirectory;
  readRepositoryRemoteTextFile?: (repoPath: string, remotePath: string) => Promise<string | null>;
  readRepositoryClaudeJson?: typeof readRepositoryClaudeJson;
}

function uniqueResolvedPaths(paths: string[]): string[] {
  const uniquePaths: string[] = [];
  for (const candidate of paths.map((entry) => path.resolve(entry))) {
    if (!uniquePaths.includes(candidate)) {
      uniquePaths.push(candidate);
    }
  }
  return uniquePaths;
}

function getUserClaudeConfigDirs(): string[] {
  const candidates = [path.join(os.homedir(), '.claude')];
  const configuredDir = process.env.CLAUDE_CONFIG_DIR?.trim();
  if (configuredDir) {
    candidates.push(configuredDir);
  }

  return uniqueResolvedPaths(candidates);
}

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

async function defaultReadLocalGeminiSettings(): Promise<GeminiSettings | null> {
  return readJsonFileSafe<GeminiSettings>(path.join(os.homedir(), '.gemini', 'settings.json'));
}

async function defaultReadLocalGeminiProjectSettings(
  workspacePath: string
): Promise<GeminiSettings | null> {
  return readJsonFileSafe<GeminiSettings>(path.join(workspacePath, '.gemini', 'settings.json'));
}

async function defaultReadRepositoryRemoteTextFile(
  repoPath: string,
  remotePath: string
): Promise<string | null> {
  const context = await getRepositoryEnvironmentContext(repoPath);
  if (context.kind !== 'remote') {
    return null;
  }

  try {
    const result = await remoteConnectionManager.call<{ content: string; isBinary?: boolean }>(
      context.connectionId,
      'fs:read',
      { path: remotePath }
    );
    if (result.isBinary) {
      return null;
    }
    return result.content;
  } catch {
    return null;
  }
}

function parseMarkdownHeading(content: string): string | undefined {
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      return trimmed.slice(2).trim() || undefined;
    }
  }
  return undefined;
}

function parseFrontMatter(content: string): { name?: string; description?: string } | null {
  const lines = content.split(/\r?\n/);
  if (lines.length < 3 || lines[0]?.trim() !== '---') {
    return null;
  }

  const endIndex = lines.slice(1).findIndex((line) => line.trim() === '---');
  if (endIndex < 0) {
    return null;
  }

  const result: { name?: string; description?: string } = {};
  for (const line of lines.slice(1, endIndex + 1)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separatorIndex = trimmed.indexOf(':');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');
    if (!value) {
      continue;
    }

    if (key === 'name') {
      result.name = value;
    }
    if (key === 'description') {
      result.description = value;
    }
  }

  return result.name || result.description ? result : null;
}

function createCapabilityItem(params: {
  id: string;
  kind: ClaudeCapabilityCatalogItem['kind'];
  name: string;
  description?: string;
  sourceScope: ClaudeCapabilitySourceScope;
  sourcePath?: string;
  isConfigurable?: boolean;
}): ClaudeCapabilityCatalogItem {
  return {
    id: params.id,
    kind: params.kind,
    name: params.name,
    description: params.description,
    sourceScope: params.sourceScope,
    sourcePath: params.sourcePath,
    sourcePaths: params.sourcePath ? [params.sourcePath] : undefined,
    isAvailable: true,
    isConfigurable: params.isConfigurable ?? params.sourceScope !== 'system',
  };
}

function createMcpItem(params: {
  id: string;
  name: string;
  config: McpServerConfig;
  scope: ClaudeMcpCatalogItem['scope'];
  sourceScope: ClaudeCapabilitySourceScope;
  sourcePath?: string;
  isConfigurable?: boolean;
}): ClaudeMcpCatalogItem {
  return {
    id: params.id,
    name: params.name,
    scope: params.scope,
    sourceScope: params.sourceScope,
    sourcePath: params.sourcePath,
    transportType: isHttpMcpConfig(params.config) ? params.config.type : 'stdio',
    isAvailable: true,
    isConfigurable: params.isConfigurable ?? params.sourceScope !== 'system',
  };
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

async function listLocalMarkdownFiles(
  rootDir: string,
  options: {
    recursive?: boolean;
    fileNameMatcher: (name: string) => boolean;
  }
): Promise<string[]> {
  const files: string[] = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || !fs.existsSync(current)) {
      continue;
    }

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const nextPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (options.recursive) {
          stack.push(nextPath);
        }
        continue;
      }
      if (!entry.isFile() || !options.fileNameMatcher(entry.name)) {
        continue;
      }
      files.push(nextPath);
    }
  }

  return files;
}

async function listRemoteFiles(
  repoPath: string,
  rootDir: string,
  listRemoteDirectory: typeof listRepositoryRemoteDirectory,
  options: {
    recursive?: boolean;
    fileNameMatcher: (name: string) => boolean;
  }
): Promise<string[]> {
  const files: string[] = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const entries = await listRemoteDirectory(repoPath, current);
    for (const entry of entries) {
      if (entry.isDirectory) {
        if (options.recursive) {
          stack.push(entry.path);
        }
        continue;
      }
      if (options.fileNameMatcher(entry.name)) {
        files.push(entry.path);
      }
    }
  }

  return files;
}

function toCommandId(filePath: string): string {
  return `command:${path.basename(filePath, path.extname(filePath))}`;
}

function toSubagentId(filePath: string): string {
  return `subagent:${path.basename(filePath, path.extname(filePath))}`;
}

function toSkillId(filePath: string): string {
  return `legacy-skill:${path.basename(path.dirname(filePath))}`;
}

async function listLocalCommandItems(
  rootDir: string,
  sourceScope: ClaudeCapabilitySourceScope
): Promise<ClaudeCapabilityCatalogItem[]> {
  const files = await listLocalMarkdownFiles(rootDir, {
    fileNameMatcher: (name) => name.toLowerCase().endsWith('.md'),
  });

  const items: ClaudeCapabilityCatalogItem[] = [];
  for (const filePath of files) {
    const content = await readTextFileSafe(filePath);
    const commandId = toCommandId(filePath);
    items.push(
      createCapabilityItem({
        id: commandId,
        kind: 'command',
        name: path.basename(filePath, path.extname(filePath)),
        description: content ? parseMarkdownHeading(content) : undefined,
        sourceScope,
        sourcePath: filePath,
      })
    );
  }
  return items;
}

async function listLocalSubagentItems(
  rootDir: string,
  sourceScope: ClaudeCapabilitySourceScope
): Promise<ClaudeCapabilityCatalogItem[]> {
  const files = await listLocalMarkdownFiles(rootDir, {
    fileNameMatcher: (name) => name.toLowerCase().endsWith('.md'),
  });

  const items: ClaudeCapabilityCatalogItem[] = [];
  for (const filePath of files) {
    const content = await readTextFileSafe(filePath);
    items.push(
      createCapabilityItem({
        id: toSubagentId(filePath),
        kind: 'subagent',
        name: path.basename(filePath, path.extname(filePath)),
        description: content ? parseMarkdownHeading(content) : undefined,
        sourceScope,
        sourcePath: filePath,
      })
    );
  }
  return items;
}

async function listLocalSkillItems(
  rootDir: string,
  sourceScope: ClaudeCapabilitySourceScope
): Promise<ClaudeCapabilityCatalogItem[]> {
  const files = await listLocalMarkdownFiles(rootDir, {
    recursive: true,
    fileNameMatcher: (name) => name.toLowerCase() === 'skill.md',
  });

  const items: ClaudeCapabilityCatalogItem[] = [];
  for (const filePath of files) {
    const content = await readTextFileSafe(filePath);
    const meta = content ? parseFrontMatter(content) : null;
    items.push(
      createCapabilityItem({
        id: toSkillId(filePath),
        kind: 'legacy-skill',
        name: meta?.name ?? path.basename(path.dirname(filePath)),
        description: meta?.description ?? (content ? parseMarkdownHeading(content) : undefined),
        sourceScope,
        sourcePath: filePath,
      })
    );
  }
  return items;
}

async function listLocalSkillItemsFromRoots(
  rootDirs: string[],
  sourceScope: ClaudeCapabilitySourceScope
): Promise<ClaudeCapabilityCatalogItem[]> {
  const items: ClaudeCapabilityCatalogItem[] = [];
  for (const rootDir of uniqueResolvedPaths(rootDirs)) {
    items.push(...(await listLocalSkillItems(rootDir, sourceScope)));
  }
  return items;
}

async function listRemoteCommandItems(
  repoPath: string,
  rootDir: string,
  listRemoteDirectory: typeof listRepositoryRemoteDirectory,
  readRemoteTextFile: (repoPath: string, remotePath: string) => Promise<string | null>
): Promise<ClaudeCapabilityCatalogItem[]> {
  const files = await listRemoteFiles(repoPath, rootDir, listRemoteDirectory, {
    fileNameMatcher: (name) => name.toLowerCase().endsWith('.md'),
  });

  const items: ClaudeCapabilityCatalogItem[] = [];
  for (const filePath of files) {
    const content = await readRemoteTextFile(repoPath, filePath);
    items.push(
      createCapabilityItem({
        id: toCommandId(filePath),
        kind: 'command',
        name: path.basename(filePath, path.extname(filePath)),
        description: content ? parseMarkdownHeading(content) : undefined,
        sourceScope: 'remote',
        sourcePath: filePath,
      })
    );
  }
  return items;
}

async function listRemoteSubagentItems(
  repoPath: string,
  rootDir: string,
  listRemoteDirectory: typeof listRepositoryRemoteDirectory,
  readRemoteTextFile: (repoPath: string, remotePath: string) => Promise<string | null>
): Promise<ClaudeCapabilityCatalogItem[]> {
  const files = await listRemoteFiles(repoPath, rootDir, listRemoteDirectory, {
    fileNameMatcher: (name) => name.toLowerCase().endsWith('.md'),
  });

  const items: ClaudeCapabilityCatalogItem[] = [];
  for (const filePath of files) {
    const content = await readRemoteTextFile(repoPath, filePath);
    items.push(
      createCapabilityItem({
        id: toSubagentId(filePath),
        kind: 'subagent',
        name: path.basename(filePath, path.extname(filePath)),
        description: content ? parseMarkdownHeading(content) : undefined,
        sourceScope: 'remote',
        sourcePath: filePath,
      })
    );
  }
  return items;
}

async function listRemoteSkillItems(
  repoPath: string,
  rootDir: string,
  listRemoteDirectory: typeof listRepositoryRemoteDirectory,
  readRemoteTextFile: (repoPath: string, remotePath: string) => Promise<string | null>
): Promise<ClaudeCapabilityCatalogItem[]> {
  const files = await listRemoteFiles(repoPath, rootDir, listRemoteDirectory, {
    recursive: true,
    fileNameMatcher: (name) => name.toLowerCase() === 'skill.md',
  });

  const items: ClaudeCapabilityCatalogItem[] = [];
  for (const filePath of files) {
    const content = await readRemoteTextFile(repoPath, filePath);
    const meta = content ? parseFrontMatter(content) : null;
    items.push(
      createCapabilityItem({
        id: toSkillId(filePath),
        kind: 'legacy-skill',
        name: meta?.name ?? path.basename(path.dirname(filePath)),
        description: meta?.description ?? (content ? parseMarkdownHeading(content) : undefined),
        sourceScope: 'remote',
        sourcePath: filePath,
      })
    );
  }
  return items;
}

async function listRemoteSkillItemsFromRoots(
  repoPath: string,
  rootDirs: string[],
  listRemoteDirectory: typeof listRepositoryRemoteDirectory,
  readRemoteTextFile: (repoPath: string, remotePath: string) => Promise<string | null>
): Promise<ClaudeCapabilityCatalogItem[]> {
  const items: ClaudeCapabilityCatalogItem[] = [];
  const visited = new Set<string>();

  for (const rootDir of rootDirs) {
    const normalizedRoot = rootDir.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
    if (visited.has(normalizedRoot)) {
      continue;
    }
    visited.add(normalizedRoot);
    items.push(
      ...(await listRemoteSkillItems(
        repoPath,
        normalizedRoot,
        listRemoteDirectory,
        readRemoteTextFile
      ))
    );
  }

  return items;
}

function dedupeById<T extends { id: string; sourceScope: ClaudeCapabilitySourceScope }>(
  items: T[]
): T[] {
  const precedence: Record<ClaudeCapabilitySourceScope, number> = {
    system: 0,
    user: 1,
    project: 2,
    worktree: 3,
    remote: 4,
  };
  const byId = new Map<string, T>();

  const toNormalizedSourcePaths = (item: T): string[] => {
    if (!('sourcePath' in item) && !('sourcePaths' in item)) {
      return [];
    }

    const sourcePaths = new Set<string>();
    const singleSourcePath =
      'sourcePath' in item && typeof item.sourcePath === 'string' ? item.sourcePath : undefined;
    const multipleSourcePaths =
      'sourcePaths' in item && Array.isArray(item.sourcePaths) ? item.sourcePaths : [];

    if (singleSourcePath) {
      sourcePaths.add(singleSourcePath);
    }
    for (const sourcePath of multipleSourcePaths) {
      if (typeof sourcePath === 'string' && sourcePath.trim()) {
        sourcePaths.add(sourcePath);
      }
    }

    return [...sourcePaths].sort((left, right) => left.localeCompare(right));
  };

  const isSystemSkillPath = (sourcePath: string | undefined): boolean =>
    typeof sourcePath === 'string' && /(^|[\\/])\.system([\\/]|$)/.test(sourcePath);

  const compareSourcePathPreference = (
    left: string | undefined,
    right: string | undefined
  ): number => {
    if (left === right) {
      return 0;
    }
    if (!left) {
      return -1;
    }
    if (!right) {
      return 1;
    }

    const leftIsSystemPath = isSystemSkillPath(left);
    const rightIsSystemPath = isSystemSkillPath(right);
    if (leftIsSystemPath !== rightIsSystemPath) {
      return leftIsSystemPath ? -1 : 1;
    }

    return left.localeCompare(right);
  };

  for (const item of items) {
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, item);
      continue;
    }

    const mergedSourcePaths = [
      ...new Set([...toNormalizedSourcePaths(existing), ...toNormalizedSourcePaths(item)]),
    ];
    const shouldReplace =
      precedence[item.sourceScope] > precedence[existing.sourceScope] ||
      (precedence[item.sourceScope] === precedence[existing.sourceScope] &&
        compareSourcePathPreference(
          'sourcePath' in item && typeof item.sourcePath === 'string' ? item.sourcePath : undefined,
          'sourcePath' in existing && typeof existing.sourcePath === 'string'
            ? existing.sourcePath
            : undefined
        ) > 0);

    const preferred = shouldReplace ? item : existing;
    const mergedItem = { ...preferred } as T;
    if ('sourcePaths' in mergedItem || 'sourcePath' in mergedItem) {
      if (mergedSourcePaths.length > 0) {
        const preferredSourcePath =
          'sourcePath' in preferred && typeof preferred.sourcePath === 'string'
            ? preferred.sourcePath
            : undefined;
        Object.assign(mergedItem as object, {
          sourcePath:
            preferredSourcePath && mergedSourcePaths.includes(preferredSourcePath)
              ? preferredSourcePath
              : (mergedSourcePaths.find((sourcePath) => !isSystemSkillPath(sourcePath)) ??
                mergedSourcePaths[0]),
          sourcePaths: mergedSourcePaths,
        });
      } else {
        Object.assign(mergedItem as object, {
          sourcePath: undefined,
          sourcePaths: undefined,
        });
      }
    }

    byId.set(item.id, mergedItem);
  }

  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function createBuiltinCommandItems(): ClaudeCapabilityCatalogItem[] {
  return BUILTIN_COMMANDS.map((command) =>
    createCapabilityItem({
      id: `command:${command.id}`,
      kind: 'command',
      name: command.name,
      description: command.description,
      sourceScope: 'system',
      isConfigurable: false,
    })
  );
}

function getLocalUserSkillRootDirs(userClaudeDirs: string[]): string[] {
  return uniqueResolvedPaths([
    ...userClaudeDirs.map((configDir) => path.join(configDir, 'skills')),
    path.join(os.homedir(), '.gemini', 'skills'),
    path.join(os.homedir(), '.agents', 'skills'),
    path.join(os.homedir(), '.codex', 'skills'),
  ]);
}

function getLocalWorkspaceSkillRootDirs(workspacePath: string): string[] {
  return uniqueResolvedPaths([
    path.join(workspacePath, '.claude', 'skills'),
    path.join(workspacePath, '.gemini', 'skills'),
    path.join(workspacePath, '.agents', 'skills'),
    path.join(workspacePath, '.codex', 'skills'),
  ]);
}

function getRemoteUserSkillRootDirs(homeDir: string, claudeSkillsDir: string): string[] {
  return [
    claudeSkillsDir,
    `${toPosixRemotePath(homeDir)}/.gemini/skills`,
    `${toPosixRemotePath(homeDir)}/.agents/skills`,
    `${toPosixRemotePath(homeDir)}/.codex/skills`,
  ];
}

function getRemoteWorkspaceSkillRootDirs(workspacePath: string): string[] {
  const normalizedWorkspacePath = toPosixRemotePath(workspacePath);
  return [
    `${normalizedWorkspacePath}/.claude/skills`,
    `${normalizedWorkspacePath}/.gemini/skills`,
    `${normalizedWorkspacePath}/.agents/skills`,
    `${normalizedWorkspacePath}/.codex/skills`,
  ];
}

function toPosixRemotePath(inputPath: string): string {
  return inputPath.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
}

async function readLocalSharedMcpItems(
  workspacePath: string,
  sourceScope: ClaudeCapabilitySourceScope
): Promise<ClaudeMcpCatalogItem[]> {
  const data = await readJsonFileSafe<Record<string, unknown>>(
    path.join(workspacePath, '.mcp.json')
  );
  return Object.entries(normalizeMcpRecord(data)).map(([id, config]) =>
    createMcpItem({
      id,
      name: id,
      config,
      scope: 'shared',
      sourceScope,
      sourcePath: path.join(workspacePath, '.mcp.json'),
    })
  );
}

async function readRemoteSharedMcpItems(
  repoPath: string,
  workspacePath: string,
  readRemoteTextFile: (repoPath: string, remotePath: string) => Promise<string | null>
): Promise<ClaudeMcpCatalogItem[]> {
  const content = await readRemoteTextFile(
    repoPath,
    `${workspacePath.replace(/\/+$/, '')}/.mcp.json`
  );
  if (!content?.trim()) {
    return [];
  }

  let data: Record<string, unknown> | null = null;
  try {
    data = JSON.parse(content) as Record<string, unknown>;
  } catch {
    data = null;
  }

  return Object.entries(normalizeMcpRecord(data)).map(([id, config]) =>
    createMcpItem({
      id,
      name: id,
      config,
      scope: 'shared',
      sourceScope: 'remote',
      sourcePath: `${workspacePath.replace(/\/+$/, '')}/.mcp.json`,
    })
  );
}

async function readLocalPersonalMcpItems(
  workspacePath: string,
  readLocalProjectSettings: (workspacePath: string) => Promise<ClaudeProjectState | null>
): Promise<ClaudeMcpCatalogItem[]> {
  const settings = await readLocalProjectSettings(workspacePath);
  return Object.entries(settings?.mcpServers ?? {}).map(([id, config]) =>
    createMcpItem({
      id,
      name: id,
      config,
      scope: 'personal',
      sourceScope: 'user',
      sourcePath: path.join(os.homedir(), '.claude.json'),
    })
  );
}

async function readLocalGlobalPersonalMcpItems(
  readLocalClaudeJson: () => Promise<ClaudeJsonProjects | null>
): Promise<ClaudeMcpCatalogItem[]> {
  const data = await readLocalClaudeJson();
  return Object.entries(data?.mcpServers ?? {}).map(([id, config]) =>
    createMcpItem({
      id,
      name: id,
      config,
      scope: 'personal',
      sourceScope: 'user',
      sourcePath: path.join(os.homedir(), '.claude.json'),
    })
  );
}

async function readLocalGlobalGeminiPersonalMcpItems(
  readLocalGeminiSettings: () => Promise<GeminiSettings | null>
): Promise<ClaudeMcpCatalogItem[]> {
  const data = await readLocalGeminiSettings();
  return Object.entries(data?.mcpServers ?? {}).map(([id, config]) =>
    createMcpItem({
      id,
      name: id,
      config,
      scope: 'personal',
      sourceScope: 'user',
      sourcePath: path.join(os.homedir(), '.gemini', 'settings.json'),
    })
  );
}

async function readLocalGeminiPersonalMcpItems(
  workspacePath: string,
  sourceScope: ClaudeCapabilitySourceScope,
  readLocalGeminiProjectSettings: (workspacePath: string) => Promise<GeminiSettings | null>
): Promise<ClaudeMcpCatalogItem[]> {
  const settings = await readLocalGeminiProjectSettings(workspacePath);
  return Object.entries(settings?.mcpServers ?? {}).map(([id, config]) =>
    createMcpItem({
      id,
      name: id,
      config,
      scope: 'personal',
      sourceScope,
      sourcePath: path.join(workspacePath, '.gemini', 'settings.json'),
    })
  );
}

async function readLocalCodexPersonalMcpItems(
  configPath: string,
  sourceScope: ClaudeCapabilitySourceScope
): Promise<ClaudeMcpCatalogItem[]> {
  const content = await readTextFileSafe(configPath);
  return Object.entries(parseCodexMcpRecord(content)).map(([id, config]) =>
    createMcpItem({
      id,
      name: id,
      config,
      scope: 'personal',
      sourceScope,
      sourcePath: configPath,
    })
  );
}

function normalizeRemoteWorkspacePath(workspacePath: string): string {
  return parseRemoteVirtualPath(workspacePath).remotePath;
}

function readRemoteProjectSettings(
  workspacePath: string,
  claudeJson: Record<string, unknown> | null
): ClaudeProjectState | null {
  const projects = claudeJson?.projects;
  if (!projects || typeof projects !== 'object' || Array.isArray(projects)) {
    return null;
  }

  const normalizedWorkspacePath = workspacePath.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
  for (const [candidatePath, settings] of Object.entries(projects)) {
    const normalizedCandidatePath = candidatePath.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
    if (normalizedCandidatePath === normalizedWorkspacePath) {
      return (settings as ClaudeProjectState) ?? null;
    }
  }

  return null;
}

function createRemotePersonalMcpItems(
  workspacePath: string,
  claudeJson: Record<string, unknown> | null
): ClaudeMcpCatalogItem[] {
  const settings = readRemoteProjectSettings(workspacePath, claudeJson);
  return Object.entries(settings?.mcpServers ?? {}).map(([id, config]) =>
    createMcpItem({
      id,
      name: id,
      config,
      scope: 'personal',
      sourceScope: 'remote',
      sourcePath: workspacePath,
    })
  );
}

function createRemoteGlobalPersonalMcpItems(
  claudeJson: Record<string, unknown> | null,
  sourcePath: string
): ClaudeMcpCatalogItem[] {
  return Object.entries(normalizeMcpRecord(claudeJson)).map(([id, config]) =>
    createMcpItem({
      id,
      name: id,
      config,
      scope: 'personal',
      sourceScope: 'remote',
      sourcePath,
    })
  );
}

async function readRemoteGeminiSettings(
  repoPath: string,
  settingsPath: string,
  readRemoteTextFile: (repoPath: string, remotePath: string) => Promise<string | null>
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

function createRemoteGeminiPersonalMcpItems(
  settings: GeminiSettings | null,
  sourceScope: ClaudeCapabilitySourceScope,
  sourcePath: string
): ClaudeMcpCatalogItem[] {
  return Object.entries(settings?.mcpServers ?? {}).map(([id, config]) =>
    createMcpItem({
      id,
      name: id,
      config,
      scope: 'personal',
      sourceScope,
      sourcePath,
    })
  );
}

async function readRemoteCodexPersonalMcpItems(
  repoPath: string,
  configPath: string,
  readRemoteTextFile: (repoPath: string, remotePath: string) => Promise<string | null>
): Promise<ClaudeMcpCatalogItem[]> {
  const content = await readRemoteTextFile(repoPath, configPath);
  return Object.entries(parseCodexMcpRecord(content)).map(([id, config]) =>
    createMcpItem({
      id,
      name: id,
      config,
      scope: 'personal',
      sourceScope: 'remote',
      sourcePath: configPath,
    })
  );
}

export async function listClaudeCapabilityCatalog(
  params: { repoPath?: string; worktreePath?: string },
  dependencies: CapabilityCatalogServiceDependencies = {}
): Promise<ClaudeCapabilityCatalog> {
  const { repoPath, worktreePath } = params;
  const readLocalClaudeJson = dependencies.readLocalClaudeJson ?? defaultReadLocalClaudeJson;
  const readLocalProjectSettings =
    dependencies.readLocalProjectSettings ?? defaultReadLocalProjectSettings;
  const readLocalGeminiSettings =
    dependencies.readLocalGeminiSettings ?? defaultReadLocalGeminiSettings;
  const readLocalGeminiProjectSettings =
    dependencies.readLocalGeminiProjectSettings ?? defaultReadLocalGeminiProjectSettings;
  const getRemoteContext =
    dependencies.getRepositoryEnvironmentContext ?? getRepositoryEnvironmentContext;
  const listRemoteDirectory =
    dependencies.listRepositoryRemoteDirectory ?? listRepositoryRemoteDirectory;
  const readRemoteTextFile =
    dependencies.readRepositoryRemoteTextFile ?? defaultReadRepositoryRemoteTextFile;
  const readRemoteClaudeJson = dependencies.readRepositoryClaudeJson ?? readRepositoryClaudeJson;

  const capabilities: ClaudeCapabilityCatalogItem[] = createBuiltinCommandItems();
  const sharedMcpServers: ClaudeMcpCatalogItem[] = [];
  const personalMcpServers: ClaudeMcpCatalogItem[] = [];

  if (repoPath && isRemoteVirtualPath(repoPath)) {
    const context = await getRemoteContext(repoPath);
    if (context.kind === 'remote') {
      const remoteWorkspaces = [
        {
          workspacePath: repoPath,
          commandsDir: `${normalizeRemoteWorkspacePath(repoPath)}/.claude/commands`,
          skillDirs: getRemoteWorkspaceSkillRootDirs(normalizeRemoteWorkspacePath(repoPath)),
          agentsDir: `${normalizeRemoteWorkspacePath(repoPath)}/.claude/agents`,
        },
      ];
      if (worktreePath && isRemoteVirtualPath(worktreePath) && worktreePath !== repoPath) {
        remoteWorkspaces.push({
          workspacePath: worktreePath,
          commandsDir: `${normalizeRemoteWorkspacePath(worktreePath)}/.claude/commands`,
          skillDirs: getRemoteWorkspaceSkillRootDirs(normalizeRemoteWorkspacePath(worktreePath)),
          agentsDir: `${normalizeRemoteWorkspacePath(worktreePath)}/.claude/agents`,
        });
      }

      capabilities.push(
        ...(await listRemoteCommandItems(
          repoPath,
          context.claudeCommandsDir,
          listRemoteDirectory,
          readRemoteTextFile
        )),
        ...(await listRemoteSkillItemsFromRoots(
          repoPath,
          getRemoteUserSkillRootDirs(context.homeDir, context.claudeSkillsDir),
          listRemoteDirectory,
          readRemoteTextFile
        )),
        ...(await listRemoteSubagentItems(
          repoPath,
          `${context.claudeDir}/agents`,
          listRemoteDirectory,
          readRemoteTextFile
        ))
      );

      for (const workspace of remoteWorkspaces) {
        capabilities.push(
          ...(await listRemoteCommandItems(
            repoPath,
            workspace.commandsDir,
            listRemoteDirectory,
            readRemoteTextFile
          )),
          ...(await listRemoteSkillItemsFromRoots(
            repoPath,
            workspace.skillDirs,
            listRemoteDirectory,
            readRemoteTextFile
          )),
          ...(await listRemoteSubagentItems(
            repoPath,
            workspace.agentsDir,
            listRemoteDirectory,
            readRemoteTextFile
          ))
        );
        sharedMcpServers.push(
          ...(await readRemoteSharedMcpItems(
            repoPath,
            normalizeRemoteWorkspacePath(workspace.workspacePath),
            readRemoteTextFile
          ))
        );
      }

      const remoteClaudeJson = await readRemoteClaudeJson(repoPath);
      personalMcpServers.push(
        ...createRemoteGlobalPersonalMcpItems(remoteClaudeJson, context.claudeJsonPath)
      );
      personalMcpServers.push(
        ...createRemoteGeminiPersonalMcpItems(
          await readRemoteGeminiSettings(
            repoPath,
            `${toPosixRemotePath(context.homeDir)}/.gemini/settings.json`,
            readRemoteTextFile
          ),
          'user',
          `${toPosixRemotePath(context.homeDir)}/.gemini/settings.json`
        )
      );
      personalMcpServers.push(
        ...(await readRemoteCodexPersonalMcpItems(
          repoPath,
          `${toPosixRemotePath(context.homeDir)}/.codex/config.toml`,
          readRemoteTextFile
        ))
      );
      personalMcpServers.push(
        ...createRemotePersonalMcpItems(normalizeRemoteWorkspacePath(repoPath), remoteClaudeJson)
      );
      personalMcpServers.push(
        ...createRemoteGeminiPersonalMcpItems(
          await readRemoteGeminiSettings(
            repoPath,
            `${normalizeRemoteWorkspacePath(repoPath)}/.gemini/settings.json`,
            readRemoteTextFile
          ),
          'project',
          `${normalizeRemoteWorkspacePath(repoPath)}/.gemini/settings.json`
        )
      );
      personalMcpServers.push(
        ...(await readRemoteCodexPersonalMcpItems(
          repoPath,
          `${normalizeRemoteWorkspacePath(repoPath)}/.codex/config.toml`,
          readRemoteTextFile
        ))
      );
      if (worktreePath && isRemoteVirtualPath(worktreePath) && worktreePath !== repoPath) {
        personalMcpServers.push(
          ...createRemotePersonalMcpItems(
            normalizeRemoteWorkspacePath(worktreePath),
            remoteClaudeJson
          )
        );
        personalMcpServers.push(
          ...createRemoteGeminiPersonalMcpItems(
            await readRemoteGeminiSettings(
              repoPath,
              `${normalizeRemoteWorkspacePath(worktreePath)}/.gemini/settings.json`,
              readRemoteTextFile
            ),
            'worktree',
            `${normalizeRemoteWorkspacePath(worktreePath)}/.gemini/settings.json`
          )
        );
        personalMcpServers.push(
          ...(await readRemoteCodexPersonalMcpItems(
            repoPath,
            `${normalizeRemoteWorkspacePath(worktreePath)}/.codex/config.toml`,
            readRemoteTextFile
          ))
        );
      }
    }
  } else {
    const userClaudeDirs = dependencies.getUserClaudeConfigDirs?.() ?? getUserClaudeConfigDirs();
    personalMcpServers.push(...(await readLocalGlobalPersonalMcpItems(readLocalClaudeJson)));
    personalMcpServers.push(
      ...(await readLocalGlobalGeminiPersonalMcpItems(readLocalGeminiSettings))
    );
    personalMcpServers.push(
      ...(await readLocalCodexPersonalMcpItems(
        path.join(os.homedir(), '.codex', 'config.toml'),
        'user'
      ))
    );
    for (const configDir of userClaudeDirs) {
      capabilities.push(
        ...(await listLocalCommandItems(path.join(configDir, 'commands'), 'user')),
        ...(await listLocalSubagentItems(path.join(configDir, 'agents'), 'user'))
      );
    }
    capabilities.push(
      ...(await listLocalSkillItemsFromRoots(getLocalUserSkillRootDirs(userClaudeDirs), 'user'))
    );

    if (repoPath) {
      capabilities.push(
        ...(await listLocalCommandItems(path.join(repoPath, '.claude', 'commands'), 'project')),
        ...(await listLocalSkillItemsFromRoots(
          getLocalWorkspaceSkillRootDirs(repoPath),
          'project'
        )),
        ...(await listLocalSubagentItems(path.join(repoPath, '.claude', 'agents'), 'project'))
      );
      sharedMcpServers.push(...(await readLocalSharedMcpItems(repoPath, 'project')));
      personalMcpServers.push(
        ...(await readLocalPersonalMcpItems(repoPath, readLocalProjectSettings))
      );
      personalMcpServers.push(
        ...(await readLocalGeminiPersonalMcpItems(
          repoPath,
          'project',
          readLocalGeminiProjectSettings
        ))
      );
      personalMcpServers.push(
        ...(await readLocalCodexPersonalMcpItems(
          path.join(repoPath, '.codex', 'config.toml'),
          'project'
        ))
      );
    }

    if (worktreePath && worktreePath !== repoPath) {
      capabilities.push(
        ...(await listLocalCommandItems(
          path.join(worktreePath, '.claude', 'commands'),
          'worktree'
        )),
        ...(await listLocalSkillItemsFromRoots(
          getLocalWorkspaceSkillRootDirs(worktreePath),
          'worktree'
        )),
        ...(await listLocalSubagentItems(path.join(worktreePath, '.claude', 'agents'), 'worktree'))
      );
      sharedMcpServers.push(...(await readLocalSharedMcpItems(worktreePath, 'worktree')));
      personalMcpServers.push(
        ...(await readLocalPersonalMcpItems(worktreePath, readLocalProjectSettings))
      );
      personalMcpServers.push(
        ...(await readLocalGeminiPersonalMcpItems(
          worktreePath,
          'worktree',
          readLocalGeminiProjectSettings
        ))
      );
      personalMcpServers.push(
        ...(await readLocalCodexPersonalMcpItems(
          path.join(worktreePath, '.codex', 'config.toml'),
          'worktree'
        ))
      );
    }
  }

  return {
    capabilities: dedupeById(capabilities),
    sharedMcpServers: dedupeById(sharedMcpServers),
    personalMcpServers: dedupeById(personalMcpServers),
    generatedAt: Date.now(),
  };
}
