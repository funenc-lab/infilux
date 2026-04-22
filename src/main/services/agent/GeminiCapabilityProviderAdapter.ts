import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  AgentCapabilityLaunchRequest,
  ClaudeCapabilityCatalogItem,
  McpServerConfig,
  ResolvedClaudePolicy,
  SessionCreateOptions,
} from '@shared/types';
import { isRemoteVirtualPath, parseRemoteVirtualPath } from '@shared/utils/remotePath';
import { listClaudeCapabilityCatalog } from '../claude/CapabilityCatalogService';
import type {
  CapabilityMcpConfigEntry,
  CapabilityMcpConfigSet,
} from '../claude/CapabilityMcpConfigService';
import { resolveClaudePolicy } from '../claude/ClaudePolicyResolver';
import { remoteConnectionManager } from '../remote/RemoteConnectionManager';
import {
  getRepositoryEnvironmentContext,
  readRepositoryRemoteTextFile,
} from '../remote/RemoteEnvironmentService';
import { filterAgentCapabilityCatalogForProvider } from './AgentCapabilityCatalogSupport';
import type {
  AgentCapabilityProviderAdapter,
  AgentCapabilitySessionOverrides,
  PreparedAgentCapabilityLaunch,
} from './AgentCapabilityProviderAdapter';
import { resolveGeminiCapabilityMcpConfigEntries } from './GeminiCapabilityMcpConfigService';

export interface GeminiCapabilityProviderAdapterDependencies {
  listClaudeCapabilityCatalog?: typeof listClaudeCapabilityCatalog;
  resolveClaudePolicy?: typeof resolveClaudePolicy;
  resolveGeminiCapabilityMcpConfigEntries?: typeof resolveGeminiCapabilityMcpConfigEntries;
  getRepositoryEnvironmentContext?: typeof getRepositoryEnvironmentContext;
  readRepositoryRemoteTextFile?: typeof readRepositoryRemoteTextFile;
  now?: () => number;
  tempRootDir?: string;
}

interface GeminiResolvedSkillEntry {
  id: string;
  runtimeName: string;
  sourcePath: string;
  sourceDir: string;
  autoLoaded: boolean;
}

interface GeminiResolvedMcpEntry {
  id: string;
  config: McpServerConfig;
}

interface GeminiRuntimeProjection {
  warnings: string[];
  sessionOverrides: AgentCapabilitySessionOverrides;
  linkedSkillIds: string[];
  disabledSkillNames: string[];
  applied: boolean;
}

type JsonObject = Record<string, unknown>;

const GEMINI_BUILTIN_SKILL_NAMES = ['skill-creator'];
const GEMINI_RUNTIME_FILE_NAMES = [
  'oauth_creds.json',
  'google_accounts.json',
  'mcp-oauth-tokens-v2.json',
  'mcp-oauth-tokens.json',
  'GEMINI.md',
  'memory.md',
  'system.md',
];
const GEMINI_FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---/;

function toStableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => toStableValue(entry));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, toStableValue(entry)])
  );
}

function stableStringify(value: unknown): string {
  return JSON.stringify(toStableValue(value));
}

function sanitizeGeminiSkillName(name: string): string {
  return name.replace(/[:\\/<>*?"|]/g, '-');
}

function parseGeminiSkillName(content: string): string | null {
  const match = content.match(GEMINI_FRONTMATTER_REGEX);
  if (!match) {
    return null;
  }

  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf(':');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    if (key !== 'name') {
      continue;
    }

    const value = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');
    return value ? sanitizeGeminiSkillName(value) : null;
  }

  return null;
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJsonText(content: string | null): JsonObject | null {
  if (!content?.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeRemotePath(inputPath: string): string {
  return inputPath.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
}

function joinRuntimePath(isRemote: boolean, ...parts: string[]): string {
  return isRemote ? path.posix.join(...parts) : path.join(...parts);
}

function normalizeManagedPath(filePath: string, isRemote: boolean): string {
  return isRemote ? normalizeRemotePath(filePath) : path.resolve(filePath);
}

function isPathWithinRoot(candidatePath: string, rootPath: string, isRemote: boolean): boolean {
  const normalizedCandidate = normalizeManagedPath(candidatePath, isRemote);
  const normalizedRoot = normalizeManagedPath(rootPath, isRemote);
  const separator = isRemote ? '/' : path.sep;
  return (
    normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(`${normalizedRoot}${separator}`)
  );
}

function isGeminiWorkspaceAutoLoadedSkillSource(
  worktreePath: string,
  sourcePath: string,
  isRemote: boolean
): boolean {
  const autoLoadRoots = [
    joinRuntimePath(isRemote, worktreePath, '.gemini', 'skills'),
    joinRuntimePath(isRemote, worktreePath, '.agents', 'skills'),
  ];
  return autoLoadRoots.some((root) => isPathWithinRoot(sourcePath, root, isRemote));
}

function chooseGeminiConfigEntry(
  id: string,
  configs: CapabilityMcpConfigSet,
  warnings: string[]
): CapabilityMcpConfigEntry | null {
  const sharedEntry = configs.sharedById[id];
  const personalEntry = configs.personalById[id];

  if (sharedEntry && personalEntry) {
    const sharedConfig = stableStringify(sharedEntry.config);
    const personalConfig = stableStringify(personalEntry.config);
    warnings.push(
      sharedConfig === personalConfig
        ? `Gemini MCP id "${id}" exists in both shared and personal scopes. The personal scope entry was selected for runtime injection.`
        : `Gemini MCP id "${id}" has different shared and personal configurations. The personal scope entry was selected for runtime injection.`
    );
  }

  return personalEntry ?? sharedEntry ?? null;
}

function buildGeminiResolvedMcpEntries(
  resolvedPolicy: ResolvedClaudePolicy,
  configs: CapabilityMcpConfigSet
): { entries: GeminiResolvedMcpEntry[]; warnings: string[] } {
  const warnings: string[] = [];
  const allowedIds = new Set([
    ...resolvedPolicy.allowedSharedMcpIds,
    ...resolvedPolicy.allowedPersonalMcpIds,
  ]);
  const knownIds = new Set([
    ...Object.keys(configs.sharedById),
    ...Object.keys(configs.personalById),
    ...resolvedPolicy.allowedSharedMcpIds,
    ...resolvedPolicy.allowedPersonalMcpIds,
    ...resolvedPolicy.blockedSharedMcpIds,
    ...resolvedPolicy.blockedPersonalMcpIds,
  ]);

  const entries: GeminiResolvedMcpEntry[] = [];
  for (const id of [...knownIds].sort((left, right) => left.localeCompare(right))) {
    if (!allowedIds.has(id)) {
      continue;
    }

    const selectedEntry = chooseGeminiConfigEntry(id, configs, warnings);
    if (!selectedEntry) {
      warnings.push(`Gemini MCP id "${id}" has no runtime configuration source and was skipped.`);
      continue;
    }

    entries.push({
      id,
      config: selectedEntry.config,
    });
  }

  return { entries, warnings };
}

async function readLocalTextFile(filePath: string): Promise<string | null> {
  try {
    return await fs.promises.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

async function resolveGeminiSkillEntries(
  repoPath: string,
  worktreePath: string,
  capabilities: ClaudeCapabilityCatalogItem[],
  readRemoteTextFile: typeof readRepositoryRemoteTextFile
): Promise<{ entries: GeminiResolvedSkillEntry[]; warnings: string[] }> {
  const warnings: string[] = [];
  const isRemote = isRemoteVirtualPath(worktreePath);
  const skillEntries: GeminiResolvedSkillEntry[] = [];

  for (const capability of capabilities) {
    if (capability.kind !== 'legacy-skill' || !capability.sourcePath) {
      continue;
    }

    const content = isRemote
      ? await readRemoteTextFile(repoPath, capability.sourcePath)
      : await readLocalTextFile(capability.sourcePath);
    const parsedName = content ? parseGeminiSkillName(content) : null;
    if (!parsedName) {
      warnings.push(
        `Gemini skill "${capability.id}" does not expose a valid frontmatter name. Falling back to the catalog name for runtime filtering.`
      );
    }

    skillEntries.push({
      id: capability.id,
      runtimeName: parsedName ?? sanitizeGeminiSkillName(capability.name),
      sourcePath: capability.sourcePath,
      sourceDir: isRemote
        ? path.posix.dirname(capability.sourcePath)
        : path.dirname(capability.sourcePath),
      autoLoaded: isGeminiWorkspaceAutoLoadedSkillSource(
        isRemote
          ? normalizeRemotePath(parseRemoteVirtualPath(worktreePath).remotePath)
          : worktreePath,
        capability.sourcePath,
        isRemote
      ),
    });
  }

  return { entries: skillEntries, warnings };
}

function buildGeminiSettings(
  baseSettings: JsonObject | null,
  mcpEntries: GeminiResolvedMcpEntry[],
  disabledSkillNames: string[]
): JsonObject {
  const nextSettings: JsonObject = {
    ...(baseSettings ?? {}),
    mcpServers: Object.fromEntries(mcpEntries.map((entry) => [entry.id, entry.config])),
  };

  const currentMcp = isRecord(baseSettings?.mcp) ? baseSettings.mcp : {};
  nextSettings.mcp = {
    ...currentMcp,
    allowed: mcpEntries.map((entry) => entry.id),
    excluded: [],
  };

  const currentSkills = isRecord(baseSettings?.skills) ? baseSettings.skills : {};
  nextSettings.skills = {
    ...currentSkills,
    enabled: true,
    disabled: [...disabledSkillNames].sort((left, right) => left.localeCompare(right)),
  };

  return nextSettings;
}

async function ensureLocalDirectory(dirPath: string): Promise<void> {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

async function removeLocalPath(targetPath: string): Promise<void> {
  await fs.promises.rm(targetPath, { recursive: true, force: true });
}

async function linkLocalPath(sourcePath: string, targetPath: string): Promise<void> {
  await removeLocalPath(targetPath);
  await ensureLocalDirectory(path.dirname(targetPath));
  await fs.promises.symlink(sourcePath, targetPath, 'dir');
}

async function linkLocalFile(sourcePath: string, targetPath: string): Promise<void> {
  try {
    await fs.promises.access(sourcePath, fs.constants.F_OK);
  } catch {
    return;
  }

  await removeLocalPath(targetPath);
  await ensureLocalDirectory(path.dirname(targetPath));
  await fs.promises.symlink(sourcePath, targetPath);
}

async function ensureRemoteDirectory(connectionId: string, dirPath: string): Promise<void> {
  await remoteConnectionManager.call(connectionId, 'fs:createDirectory', { path: dirPath });
}

async function remotePathExists(connectionId: string, targetPath: string): Promise<boolean> {
  return remoteConnectionManager.call<boolean>(connectionId, 'fs:exists', { path: targetPath });
}

async function removeRemotePath(connectionId: string, targetPath: string): Promise<void> {
  if (!(await remotePathExists(connectionId, targetPath))) {
    return;
  }
  await remoteConnectionManager.call(connectionId, 'fs:delete', {
    path: targetPath,
    recursive: true,
  });
}

async function copyRemotePath(
  connectionId: string,
  sourcePath: string,
  targetPath: string
): Promise<void> {
  await removeRemotePath(connectionId, targetPath);
  await ensureRemoteDirectory(connectionId, path.posix.dirname(targetPath));
  await remoteConnectionManager.call(connectionId, 'fs:copy', {
    sourcePath,
    targetPath,
  });
}

async function copyRemoteFileIfExists(
  connectionId: string,
  sourcePath: string,
  targetPath: string
): Promise<void> {
  if (!(await remotePathExists(connectionId, sourcePath))) {
    return;
  }
  await copyRemotePath(connectionId, sourcePath, targetPath);
}

export function createGeminiCapabilityProviderAdapter(
  dependencies: GeminiCapabilityProviderAdapterDependencies = {}
): AgentCapabilityProviderAdapter {
  const listCatalog = dependencies.listClaudeCapabilityCatalog ?? listClaudeCapabilityCatalog;
  const resolvePolicy = dependencies.resolveClaudePolicy ?? resolveClaudePolicy;
  const resolveMcpConfigs =
    dependencies.resolveGeminiCapabilityMcpConfigEntries ?? resolveGeminiCapabilityMcpConfigEntries;
  const getRemoteContext =
    dependencies.getRepositoryEnvironmentContext ?? getRepositoryEnvironmentContext;
  const readRemoteTextFile =
    dependencies.readRepositoryRemoteTextFile ?? readRepositoryRemoteTextFile;
  const now = dependencies.now ?? Date.now;
  const tempRootDir =
    dependencies.tempRootDir ?? path.join(os.tmpdir(), 'infilux-agent-capability');

  async function buildProjection(
    request: AgentCapabilityLaunchRequest,
    resolvedPolicy: ResolvedClaudePolicy,
    capabilities: ClaudeCapabilityCatalogItem[],
    mcpConfigs: CapabilityMcpConfigSet
  ): Promise<GeminiRuntimeProjection> {
    const warnings: string[] = [];
    const { entries: skillEntries, warnings: skillWarnings } = await resolveGeminiSkillEntries(
      request.repoPath,
      request.worktreePath,
      capabilities,
      readRemoteTextFile
    );
    warnings.push(...skillWarnings);

    const { entries: mcpEntries, warnings: mcpWarnings } = buildGeminiResolvedMcpEntries(
      resolvedPolicy,
      mcpConfigs
    );
    warnings.push(...mcpWarnings);

    const allowedSkillIds = new Set(resolvedPolicy.allowedCapabilityIds);
    const linkedSkills = skillEntries.filter(
      (entry) => allowedSkillIds.has(entry.id) && !entry.autoLoaded
    );
    const disabledSkillNames = new Set(GEMINI_BUILTIN_SKILL_NAMES);
    for (const entry of skillEntries) {
      if (!allowedSkillIds.has(entry.id) && entry.autoLoaded) {
        disabledSkillNames.add(entry.runtimeName);
      }
    }

    const runtimeIsRemote = isRemoteVirtualPath(request.worktreePath);
    if (runtimeIsRemote) {
      const context = await getRemoteContext(request.repoPath);
      if (context.kind !== 'remote') {
        warnings.push(
          'Gemini runtime capability injection could not resolve the remote execution context. The session was launched without Gemini-specific runtime overrides.'
        );
        return {
          warnings,
          sessionOverrides: {
            metadata: {
              providerLaunchStrategy: 'gemini-runtime-home',
              geminiLinkedSkillIds: [],
              geminiDisabledSkillNames: [...disabledSkillNames],
              geminiMcpServerIds: mcpEntries.map((entry) => entry.id),
            },
          },
          linkedSkillIds: [],
          disabledSkillNames: [...disabledSkillNames],
          applied: false,
        };
      }

      const runtimeHome = path.posix.join(
        context.homeDir,
        '.infilux',
        'agent-capability',
        'gemini',
        resolvedPolicy.hash
      );
      const runtimeGeminiDir = path.posix.join(runtimeHome, '.gemini');
      const runtimeSkillsDir = path.posix.join(runtimeGeminiDir, 'skills');
      await removeRemotePath(context.connectionId, runtimeSkillsDir);
      await ensureRemoteDirectory(context.connectionId, runtimeSkillsDir);

      const baseSettings = readJsonText(
        await readRemoteTextFile(
          request.repoPath,
          path.posix.join(context.homeDir, '.gemini', 'settings.json')
        )
      );
      const settings = buildGeminiSettings(baseSettings, mcpEntries, [...disabledSkillNames]);
      await remoteConnectionManager.call(context.connectionId, 'fs:write', {
        path: path.posix.join(runtimeGeminiDir, 'settings.json'),
        content: JSON.stringify(settings, null, 2),
      });

      for (const fileName of GEMINI_RUNTIME_FILE_NAMES) {
        await copyRemoteFileIfExists(
          context.connectionId,
          path.posix.join(context.homeDir, '.gemini', fileName),
          path.posix.join(runtimeGeminiDir, fileName)
        );
      }

      for (const skill of linkedSkills) {
        await copyRemotePath(
          context.connectionId,
          skill.sourceDir,
          path.posix.join(runtimeSkillsDir, skill.id.replace(/^legacy-skill:/, ''))
        );
      }

      return {
        warnings,
        sessionOverrides: {
          env: {
            GEMINI_CLI_HOME: runtimeHome,
          },
          metadata: {
            providerLaunchStrategy: 'gemini-runtime-home',
            geminiHomePath: runtimeHome,
            geminiLinkedSkillIds: linkedSkills.map((entry) => entry.id),
            geminiDisabledSkillNames: [...disabledSkillNames].sort((left, right) =>
              left.localeCompare(right)
            ),
            geminiMcpServerIds: mcpEntries.map((entry) => entry.id),
          },
        },
        linkedSkillIds: linkedSkills.map((entry) => entry.id),
        disabledSkillNames: [...disabledSkillNames].sort((left, right) =>
          left.localeCompare(right)
        ),
        applied: true,
      };
    }

    const runtimeHome = path.join(tempRootDir, 'gemini', resolvedPolicy.hash);
    const runtimeGeminiDir = path.join(runtimeHome, '.gemini');
    const runtimeSkillsDir = path.join(runtimeGeminiDir, 'skills');
    await removeLocalPath(runtimeSkillsDir);
    await ensureLocalDirectory(runtimeSkillsDir);

    const baseSettings = readJsonText(
      await readLocalTextFile(path.join(os.homedir(), '.gemini', 'settings.json'))
    );
    const settings = buildGeminiSettings(baseSettings, mcpEntries, [...disabledSkillNames]);
    await fs.promises.writeFile(
      path.join(runtimeGeminiDir, 'settings.json'),
      JSON.stringify(settings, null, 2),
      'utf8'
    );

    for (const fileName of GEMINI_RUNTIME_FILE_NAMES) {
      await linkLocalFile(
        path.join(os.homedir(), '.gemini', fileName),
        path.join(runtimeGeminiDir, fileName)
      );
    }

    for (const skill of linkedSkills) {
      await linkLocalPath(
        skill.sourceDir,
        path.join(runtimeSkillsDir, skill.id.replace(/^legacy-skill:/, ''))
      );
    }

    return {
      warnings,
      sessionOverrides: {
        env: {
          GEMINI_CLI_HOME: runtimeHome,
        },
        metadata: {
          providerLaunchStrategy: 'gemini-runtime-home',
          geminiHomePath: runtimeHome,
          geminiLinkedSkillIds: linkedSkills.map((entry) => entry.id),
          geminiDisabledSkillNames: [...disabledSkillNames].sort((left, right) =>
            left.localeCompare(right)
          ),
          geminiMcpServerIds: mcpEntries.map((entry) => entry.id),
        },
      },
      linkedSkillIds: linkedSkills.map((entry) => entry.id),
      disabledSkillNames: [...disabledSkillNames].sort((left, right) => left.localeCompare(right)),
      applied: true,
    };
  }

  return {
    provider: 'gemini',
    async prepareLaunch(
      request: AgentCapabilityLaunchRequest,
      _sessionOptions: SessionCreateOptions
    ): Promise<PreparedAgentCapabilityLaunch> {
      const discoveredCatalog = await listCatalog({
        repoPath: request.repoPath,
        worktreePath: request.worktreePath,
      });
      const catalog = filterAgentCapabilityCatalogForProvider(discoveredCatalog, 'gemini');
      const resolvedPolicy = resolvePolicy({
        catalog,
        repoPath: request.repoPath,
        worktreePath: request.worktreePath,
        globalPolicy: request.globalPolicy ?? null,
        projectPolicy: request.projectPolicy,
        worktreePolicy: request.worktreePolicy,
        sessionPolicy: request.sessionPolicy ?? null,
      });
      const mcpConfigs = await resolveMcpConfigs({
        repoPath: request.repoPath,
        worktreePath: request.worktreePath,
      });
      const projection = await buildProjection(
        request,
        resolvedPolicy,
        catalog.capabilities,
        mcpConfigs
      );

      return {
        launchResult: {
          provider: 'gemini',
          repoPath: request.repoPath,
          worktreePath: request.worktreePath,
          hash: resolvedPolicy.hash,
          warnings: projection.warnings,
          resolvedPolicy,
          projected: {
            hash: resolvedPolicy.hash,
            materializationMode: 'provider-native',
            applied: projection.applied,
            updatedFiles: [],
            warnings: projection.warnings,
            errors: [],
          },
          policyHash: resolvedPolicy.hash,
          appliedAt: now(),
        },
        sessionOverrides: projection.sessionOverrides,
      };
    },
  };
}

export const geminiCapabilityProviderAdapter = createGeminiCapabilityProviderAdapter();
