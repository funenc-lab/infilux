import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  ClaudeCapabilityCatalog,
  ClaudePolicyMaterializationMode,
  ClaudeRuntimeProjectionResult,
  McpServerConfig,
  ResolvedClaudePolicy,
} from '@shared/types';
import { isRemoteVirtualPath, parseRemoteVirtualPath } from '@shared/utils/remotePath';
import {
  deleteRepositoryRemotePath as defaultDeleteRepositoryRemotePath,
  readRepositoryRemoteProjectSettings as defaultReadRepositoryRemoteProjectSettings,
  readRepositoryRemoteTextFile as defaultReadRepositoryRemoteTextFile,
  writeRepositoryRemoteProjectSettings as defaultWriteRepositoryRemoteProjectSettings,
  writeRepositoryRemoteTextFile as defaultWriteRepositoryRemoteTextFile,
} from '../remote/RemoteEnvironmentService';
import {
  type ClaudeProjectSettings,
  readClaudeProjectSettings,
  writeClaudeProjectSettings,
} from './ClaudeWorkspaceTrust';

const POLICY_MANIFEST_FILE = '.infilux-claude-policy.json';

interface RuntimePolicyManifest {
  managedFiles: string[];
}

interface RuntimeProjectionCapabilityDestination {
  targetPath: string;
  symlinkSourcePath: string;
  symlinkType: 'file' | 'dir';
}

type DesiredRuntimeArtifact =
  | {
      kind: 'file';
      content: string;
    }
  | {
      kind: 'symlink';
      sourcePath: string;
      symlinkType: 'file' | 'dir';
    };

export interface ClaudeRuntimeProjectorDependencies {
  readRepositoryRemoteTextFile?: typeof defaultReadRepositoryRemoteTextFile;
  writeRepositoryRemoteTextFile?: typeof defaultWriteRepositoryRemoteTextFile;
  deleteRepositoryRemotePath?: typeof defaultDeleteRepositoryRemotePath;
  readLocalProjectSettings?: (workspacePath: string) => Record<string, unknown> | null;
  readRemoteProjectSettings?: (
    repoPath: string,
    workspacePath: string
  ) => Promise<Record<string, unknown> | null>;
  updateLocalProjectSettings?: (
    workspacePath: string,
    settings: Record<string, unknown>
  ) => Promise<boolean>;
  updateRemoteProjectSettings?: (
    repoPath: string,
    workspacePath: string,
    settings: Record<string, unknown>
  ) => Promise<boolean>;
  sharedMcpConfigById?: Record<string, McpServerConfig>;
  personalMcpConfigById?: Record<string, McpServerConfig>;
}

function toPosixPath(inputPath: string): string {
  return inputPath.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
}

function basenameFromPath(inputPath: string): string {
  const normalized = toPosixPath(inputPath);
  return normalized.slice(normalized.lastIndexOf('/') + 1);
}

function parentDirNameFromPath(inputPath: string): string {
  const normalized = toPosixPath(inputPath);
  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 2] ?? '';
}

function joinRemotePath(basePath: string, ...segments: string[]): string {
  return [toPosixPath(basePath), ...segments].join('/');
}

function areManagedPathsEqual(
  leftPath: string,
  rightPath: string,
  isRemoteRuntime: boolean
): boolean {
  return isRemoteRuntime
    ? toPosixPath(leftPath) === toPosixPath(rightPath)
    : path.resolve(leftPath) === path.resolve(rightPath);
}

function buildCapabilityCopyDestinationPath(
  runtimeWorkspacePath: string,
  capability: ClaudeCapabilityCatalog['capabilities'][number],
  isRemoteRuntime: boolean
): string | null {
  if (!capability.sourcePath) {
    return null;
  }

  const fileName = basenameFromPath(capability.sourcePath);
  const joinWorkspacePath = isRemoteRuntime ? joinRemotePath : path.join;

  if (capability.kind === 'command') {
    return joinWorkspacePath(runtimeWorkspacePath, '.claude', 'commands', fileName);
  }
  if (capability.kind === 'subagent') {
    return joinWorkspacePath(runtimeWorkspacePath, '.claude', 'agents', fileName);
  }
  if (capability.kind === 'legacy-skill') {
    return joinWorkspacePath(
      runtimeWorkspacePath,
      '.claude',
      'skills',
      parentDirNameFromPath(capability.sourcePath),
      'SKILL.md'
    );
  }
  return null;
}

function buildCapabilitySymlinkDestination(
  runtimeWorkspacePath: string,
  capability: ClaudeCapabilityCatalog['capabilities'][number]
): RuntimeProjectionCapabilityDestination | null {
  if (!capability.sourcePath) {
    return null;
  }

  if (capability.kind === 'command') {
    return {
      targetPath: path.join(
        runtimeWorkspacePath,
        '.claude',
        'commands',
        path.basename(capability.sourcePath)
      ),
      symlinkSourcePath: capability.sourcePath,
      symlinkType: 'file',
    };
  }

  if (capability.kind === 'subagent') {
    return {
      targetPath: path.join(
        runtimeWorkspacePath,
        '.claude',
        'agents',
        path.basename(capability.sourcePath)
      ),
      symlinkSourcePath: capability.sourcePath,
      symlinkType: 'file',
    };
  }

  if (capability.kind === 'legacy-skill') {
    const sourceDir = path.dirname(capability.sourcePath);
    return {
      targetPath: path.join(runtimeWorkspacePath, '.claude', 'skills', path.basename(sourceDir)),
      symlinkSourcePath: sourceDir,
      symlinkType: 'dir',
    };
  }

  return null;
}

async function readLocalTextFile(filePath: string): Promise<string | null> {
  try {
    return await fs.promises.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

async function writeLocalTextFile(filePath: string, content: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content, 'utf8');
}

async function writeLocalSymlink(
  targetPath: string,
  sourcePath: string,
  symlinkType: 'file' | 'dir'
): Promise<boolean> {
  const existingEntry = await fs.promises.lstat(targetPath).catch(() => null);
  if (existingEntry?.isSymbolicLink()) {
    const existingTarget = await fs.promises.readlink(targetPath).catch(() => null);
    if (existingTarget) {
      const resolvedExistingTarget = path.resolve(path.dirname(targetPath), existingTarget);
      if (resolvedExistingTarget === path.resolve(sourcePath)) {
        return false;
      }
    }
  }

  if (existingEntry) {
    await deleteLocalPath(targetPath);
  }

  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.promises.symlink(sourcePath, targetPath, symlinkType);
  return true;
}

async function deleteLocalPath(filePath: string): Promise<void> {
  await fs.promises.rm(filePath, { recursive: true, force: true });
}

function normalizeMcpConfigRecord(value: unknown): Record<string, McpServerConfig> {
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

function sortObjectDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortObjectDeep(entry));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortObjectDeep(entry)])
  );
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortObjectDeep(value));
}

async function readManifest(
  runtimeWorkspacePath: string,
  repoPath: string,
  isRemoteRuntime: boolean,
  readRemoteTextFile: typeof defaultReadRepositoryRemoteTextFile
): Promise<RuntimePolicyManifest> {
  const manifestPath = isRemoteRuntime
    ? joinRemotePath(runtimeWorkspacePath, '.claude', POLICY_MANIFEST_FILE)
    : path.join(runtimeWorkspacePath, '.claude', POLICY_MANIFEST_FILE);
  const raw = isRemoteRuntime
    ? await readRemoteTextFile(repoPath, manifestPath)
    : await readLocalTextFile(manifestPath);

  if (!raw?.trim()) {
    return { managedFiles: [] };
  }

  try {
    const parsed = JSON.parse(raw) as RuntimePolicyManifest;
    return {
      managedFiles: Array.isArray(parsed.managedFiles)
        ? parsed.managedFiles.filter((entry): entry is string => typeof entry === 'string')
        : [],
    };
  } catch {
    return { managedFiles: [] };
  }
}

async function writeManifest(
  runtimeWorkspacePath: string,
  repoPath: string,
  manifest: RuntimePolicyManifest,
  isRemoteRuntime: boolean,
  writeRemoteTextFile: typeof defaultWriteRepositoryRemoteTextFile
): Promise<void> {
  const manifestPath = isRemoteRuntime
    ? joinRemotePath(runtimeWorkspacePath, '.claude', POLICY_MANIFEST_FILE)
    : path.join(runtimeWorkspacePath, '.claude', POLICY_MANIFEST_FILE);
  const content = JSON.stringify(
    { managedFiles: [...new Set(manifest.managedFiles)].sort() },
    null,
    2
  );

  if (isRemoteRuntime) {
    await writeRemoteTextFile(repoPath, manifestPath, content);
    return;
  }

  await writeLocalTextFile(manifestPath, content);
}

async function loadSharedMcpConfigById(
  params: {
    repoPath: string;
    worktreePath: string;
  },
  dependencies: ClaudeRuntimeProjectorDependencies
): Promise<Record<string, McpServerConfig>> {
  if (dependencies.sharedMcpConfigById) {
    return { ...dependencies.sharedMcpConfigById };
  }

  if (isRemoteVirtualPath(params.repoPath)) {
    const readRemoteTextFile =
      dependencies.readRepositoryRemoteTextFile ?? defaultReadRepositoryRemoteTextFile;
    const lookup: Record<string, McpServerConfig> = {};
    const workspacePaths = [
      parseRemoteVirtualPath(params.repoPath).remotePath,
      parseRemoteVirtualPath(params.worktreePath).remotePath,
    ];

    for (const workspacePath of workspacePaths) {
      const content = await readRemoteTextFile(
        params.repoPath,
        `${toPosixPath(workspacePath)}/.mcp.json`
      );
      if (!content?.trim()) {
        continue;
      }
      try {
        Object.assign(lookup, normalizeMcpConfigRecord(JSON.parse(content) as unknown));
      } catch {
        // Ignore malformed source payloads and keep projecting the rest.
      }
    }

    return lookup;
  }

  const lookup: Record<string, McpServerConfig> = {};
  for (const workspacePath of [params.repoPath, params.worktreePath]) {
    const content = await readLocalTextFile(path.join(workspacePath, '.mcp.json'));
    if (!content?.trim()) {
      continue;
    }
    try {
      Object.assign(lookup, normalizeMcpConfigRecord(JSON.parse(content) as unknown));
    } catch {
      // Ignore malformed source payloads and keep projecting the rest.
    }
  }

  return lookup;
}

async function loadPersonalMcpConfigById(
  params: {
    repoPath: string;
    worktreePath: string;
  },
  dependencies: ClaudeRuntimeProjectorDependencies
): Promise<Record<string, McpServerConfig>> {
  if (dependencies.personalMcpConfigById) {
    return { ...dependencies.personalMcpConfigById };
  }

  const lookup: Record<string, McpServerConfig> = {};

  if (isRemoteVirtualPath(params.repoPath)) {
    for (const workspacePath of [params.repoPath, params.worktreePath]) {
      const actualWorkspacePath = parseRemoteVirtualPath(workspacePath).remotePath;
      const settings = await defaultReadRepositoryRemoteProjectSettings(
        params.repoPath,
        actualWorkspacePath
      );
      Object.assign(lookup, normalizeMcpConfigRecord(settings?.mcpServers));
    }
    return lookup;
  }

  for (const workspacePath of [params.repoPath, params.worktreePath]) {
    const settings = readClaudeProjectSettings(workspacePath);
    Object.assign(lookup, normalizeMcpConfigRecord(settings?.mcpServers));
  }

  return lookup;
}

function resolveRequestedMaterializationMode(
  requestedMode: ClaudePolicyMaterializationMode | undefined,
  isRemoteRuntime: boolean
): {
  effectiveMode: ClaudePolicyMaterializationMode;
  warnings: string[];
} {
  if (requestedMode === 'provider-native') {
    return {
      effectiveMode: 'provider-native',
      warnings: [],
    };
  }

  if (requestedMode === 'symlink') {
    if (isRemoteRuntime) {
      return {
        effectiveMode: 'copy',
        warnings: [
          'Claude runtime symlink materialization is not available for remote workspaces.',
        ],
      };
    }

    if (process.platform === 'win32') {
      return {
        effectiveMode: 'copy',
        warnings: [
          'Claude runtime symlink materialization is not enabled on Windows. Falling back to copy.',
        ],
      };
    }

    return {
      effectiveMode: 'symlink',
      warnings: [],
    };
  }

  return {
    effectiveMode: 'copy',
    warnings: [],
  };
}

async function writeDesiredArtifact(
  params: {
    repoPath: string;
    targetPath: string;
    artifact: DesiredRuntimeArtifact;
    isRemoteRuntime: boolean;
  },
  dependencies: ClaudeRuntimeProjectorDependencies
): Promise<boolean> {
  if (params.artifact.kind === 'symlink') {
    if (params.isRemoteRuntime) {
      throw new Error('Remote runtime symlink materialization is not supported');
    }
    return writeLocalSymlink(
      params.targetPath,
      params.artifact.sourcePath,
      params.artifact.symlinkType
    );
  }

  if (params.isRemoteRuntime) {
    const readRemoteTextFile =
      dependencies.readRepositoryRemoteTextFile ?? defaultReadRepositoryRemoteTextFile;
    const writeRemoteTextFile =
      dependencies.writeRepositoryRemoteTextFile ?? defaultWriteRepositoryRemoteTextFile;
    const existing = await readRemoteTextFile(params.repoPath, params.targetPath);
    if (existing === params.artifact.content) {
      return false;
    }
    return writeRemoteTextFile(params.repoPath, params.targetPath, params.artifact.content);
  }

  const existing = await readLocalTextFile(params.targetPath);
  if (existing === params.artifact.content) {
    return false;
  }
  await writeLocalTextFile(params.targetPath, params.artifact.content);
  return true;
}

async function deleteManagedFile(
  params: {
    repoPath: string;
    targetPath: string;
    isRemoteRuntime: boolean;
  },
  dependencies: ClaudeRuntimeProjectorDependencies
): Promise<boolean> {
  if (params.isRemoteRuntime) {
    const deleteRemotePath =
      dependencies.deleteRepositoryRemotePath ?? defaultDeleteRepositoryRemotePath;
    return deleteRemotePath(params.repoPath, params.targetPath);
  }

  await deleteLocalPath(params.targetPath);
  return true;
}

export async function projectClaudeRuntimePolicy(
  params: {
    repoPath: string;
    worktreePath: string;
    materializationMode?: ClaudePolicyMaterializationMode;
    catalog: ClaudeCapabilityCatalog;
    resolvedPolicy: ResolvedClaudePolicy;
    projectWorkspaceMcp?: boolean;
  },
  dependencies: ClaudeRuntimeProjectorDependencies = {}
): Promise<ClaudeRuntimeProjectionResult> {
  const isRemoteRuntime = isRemoteVirtualPath(params.worktreePath);
  const runtimeWorkspacePath = isRemoteRuntime
    ? parseRemoteVirtualPath(params.worktreePath).remotePath
    : params.worktreePath;
  const projectWorkspaceMcp = params.projectWorkspaceMcp ?? true;
  const { effectiveMode, warnings: modeWarnings } = resolveRequestedMaterializationMode(
    params.materializationMode,
    isRemoteRuntime
  );
  const warnings: string[] = [...modeWarnings];
  const errors: string[] = [];
  const updatedFiles: string[] = [];
  const desiredArtifacts = new Map<string, DesiredRuntimeArtifact>();
  const protectedManagedPaths = new Set<string>();
  const manifest = await readManifest(
    runtimeWorkspacePath,
    params.repoPath,
    isRemoteRuntime,
    dependencies.readRepositoryRemoteTextFile ?? defaultReadRepositoryRemoteTextFile
  );
  const sharedMcpConfigById = projectWorkspaceMcp
    ? await loadSharedMcpConfigById(params, dependencies)
    : {};
  const personalMcpConfigById = projectWorkspaceMcp
    ? await loadPersonalMcpConfigById(params, dependencies)
    : {};
  for (const capability of params.catalog.capabilities) {
    if (!capability.sourcePath) {
      continue;
    }

    if (effectiveMode === 'symlink' && !isRemoteRuntime) {
      const symlinkDestination = buildCapabilitySymlinkDestination(
        runtimeWorkspacePath,
        capability
      );
      if (
        symlinkDestination &&
        areManagedPathsEqual(
          symlinkDestination.targetPath,
          symlinkDestination.symlinkSourcePath,
          isRemoteRuntime
        )
      ) {
        protectedManagedPaths.add(symlinkDestination.targetPath);
      }
      continue;
    }

    const copyTargetPath = buildCapabilityCopyDestinationPath(
      runtimeWorkspacePath,
      capability,
      isRemoteRuntime
    );
    if (
      copyTargetPath &&
      areManagedPathsEqual(copyTargetPath, capability.sourcePath, isRemoteRuntime)
    ) {
      protectedManagedPaths.add(copyTargetPath);
    }
  }
  const allowedCapabilities = params.catalog.capabilities.filter((item) =>
    params.resolvedPolicy.allowedCapabilityIds.includes(item.id)
  );

  if (effectiveMode === 'provider-native') {
    return {
      hash: params.resolvedPolicy.hash,
      materializationMode: effectiveMode,
      applied: false,
      updatedFiles,
      warnings: [
        ...warnings,
        'Provider-native materialization is not implemented for Claude runtime projection.',
      ],
      errors,
    };
  }

  for (const capability of allowedCapabilities) {
    if (!capability.sourcePath) {
      continue;
    }

    if (effectiveMode === 'symlink' && !isRemoteRuntime) {
      const symlinkDestination = buildCapabilitySymlinkDestination(
        runtimeWorkspacePath,
        capability
      );
      if (!symlinkDestination) {
        warnings.push(`Unable to symlink capability ${capability.id}`);
        continue;
      }
      if (
        areManagedPathsEqual(
          symlinkDestination.targetPath,
          symlinkDestination.symlinkSourcePath,
          isRemoteRuntime
        )
      ) {
        protectedManagedPaths.add(symlinkDestination.targetPath);
        continue;
      }
      const sourceExists = await fs.promises
        .lstat(symlinkDestination.symlinkSourcePath)
        .then(() => true)
        .catch(() => false);
      if (!sourceExists) {
        warnings.push(`Unable to find capability source ${capability.id} for symlink projection`);
        continue;
      }

      desiredArtifacts.set(symlinkDestination.targetPath, {
        kind: 'symlink',
        sourcePath: symlinkDestination.symlinkSourcePath,
        symlinkType: symlinkDestination.symlinkType,
      });
      continue;
    }

    const targetPath = buildCapabilityCopyDestinationPath(
      runtimeWorkspacePath,
      capability,
      isRemoteRuntime
    );
    if (!targetPath) {
      warnings.push(`Unable to project capability ${capability.id}`);
      continue;
    }
    if (areManagedPathsEqual(targetPath, capability.sourcePath, isRemoteRuntime)) {
      protectedManagedPaths.add(targetPath);
      continue;
    }

    const content = isRemoteRuntime
      ? await (dependencies.readRepositoryRemoteTextFile ?? defaultReadRepositoryRemoteTextFile)(
          params.repoPath,
          capability.sourcePath
        )
      : await readLocalTextFile(capability.sourcePath);
    if (content === null) {
      warnings.push(`Unable to read capability source ${capability.id}`);
      continue;
    }

    desiredArtifacts.set(targetPath, { kind: 'file', content });
  }

  if (projectWorkspaceMcp) {
    const sharedMcpConfigs = Object.fromEntries(
      params.resolvedPolicy.allowedSharedMcpIds
        .map((id) => [id, sharedMcpConfigById[id]] as const)
        .filter((entry): entry is [string, McpServerConfig] => Boolean(entry[1]))
    );
    const mcpTargetPath = isRemoteRuntime
      ? joinRemotePath(runtimeWorkspacePath, '.mcp.json')
      : path.join(runtimeWorkspacePath, '.mcp.json');
    const desiredMcpContent = JSON.stringify({ mcpServers: sharedMcpConfigs }, null, 2);
    const existingMcpContent = isRemoteRuntime
      ? await (dependencies.readRepositoryRemoteTextFile ?? defaultReadRepositoryRemoteTextFile)(
          params.repoPath,
          mcpTargetPath
        )
      : await readLocalTextFile(mcpTargetPath);
    const isUnmanagedWorkspaceMcpSource =
      existingMcpContent !== null && !manifest.managedFiles.includes(mcpTargetPath);
    if (isUnmanagedWorkspaceMcpSource) {
      protectedManagedPaths.add(mcpTargetPath);
      if (existingMcpContent !== desiredMcpContent) {
        warnings.push(
          'Skipping shared MCP projection because the current workspace already owns .mcp.json.'
        );
      }
    } else {
      desiredArtifacts.set(mcpTargetPath, {
        kind: 'file',
        content: desiredMcpContent,
      });
    }
  }

  for (const managedFile of manifest.managedFiles) {
    if (desiredArtifacts.has(managedFile) || protectedManagedPaths.has(managedFile)) {
      continue;
    }

    try {
      const deleted = await deleteManagedFile(
        {
          repoPath: params.repoPath,
          targetPath: managedFile,
          isRemoteRuntime,
        },
        dependencies
      );
      if (deleted) {
        updatedFiles.push(managedFile);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  for (const [targetPath, artifact] of desiredArtifacts.entries()) {
    try {
      const changed = await writeDesiredArtifact(
        {
          repoPath: params.repoPath,
          targetPath,
          artifact,
          isRemoteRuntime,
        },
        dependencies
      );
      if (changed) {
        updatedFiles.push(targetPath);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  let personalSettingsChanged = false;
  if (projectWorkspaceMcp) {
    const selectedPersonalMcpConfigs = Object.fromEntries(
      params.resolvedPolicy.allowedPersonalMcpIds
        .map((id) => [id, personalMcpConfigById[id]] as const)
        .filter((entry): entry is [string, McpServerConfig] => Boolean(entry[1]))
    );
    const existingProjectSettings = isRemoteRuntime
      ? await (
          dependencies.readRemoteProjectSettings ?? defaultReadRepositoryRemoteProjectSettings
        )(params.repoPath, runtimeWorkspacePath)
      : (dependencies.readLocalProjectSettings ?? readClaudeProjectSettings)(runtimeWorkspacePath);
    const nextProjectSettings = {
      ...(existingProjectSettings ?? {}),
      mcpServers: selectedPersonalMcpConfigs,
    };
    personalSettingsChanged =
      stableStringify(existingProjectSettings?.mcpServers ?? {}) !==
      stableStringify(selectedPersonalMcpConfigs);

    if (personalSettingsChanged) {
      const updated = isRemoteRuntime
        ? await (
            dependencies.updateRemoteProjectSettings ?? defaultWriteRepositoryRemoteProjectSettings
          )(params.repoPath, runtimeWorkspacePath, nextProjectSettings)
        : await (
            dependencies.updateLocalProjectSettings ??
            (async (workspacePath: string, settings: Record<string, unknown>) =>
              writeClaudeProjectSettings(workspacePath, settings as ClaudeProjectSettings))
          )(runtimeWorkspacePath, nextProjectSettings);

      if (!updated) {
        errors.push(`Failed to update personal MCP settings for ${runtimeWorkspacePath}`);
      }
    }
  }

  const nextManifest: RuntimePolicyManifest = {
    managedFiles: [...desiredArtifacts.keys()].sort(),
  };
  const manifestChanged =
    stableStringify(manifest.managedFiles.sort()) !== stableStringify(nextManifest.managedFiles);

  if (manifestChanged) {
    await writeManifest(
      runtimeWorkspacePath,
      params.repoPath,
      nextManifest,
      isRemoteRuntime,
      dependencies.writeRepositoryRemoteTextFile ?? defaultWriteRepositoryRemoteTextFile
    );
  }

  return {
    hash: params.resolvedPolicy.hash,
    materializationMode: effectiveMode,
    applied: updatedFiles.length > 0 || personalSettingsChanged || manifestChanged,
    updatedFiles,
    warnings,
    errors,
  };
}
