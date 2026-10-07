import type {
  AgentCapabilityLaunchRequest,
  ClaudeCapabilityCatalogItem,
  ClaudeCapabilitySourceScope,
  McpServerConfig,
  ResolvedClaudePolicy,
  SessionCreateOptions,
} from '@shared/types';
import { isHttpMcpConfig } from '@shared/types';
import { isRemoteVirtualPath } from '@shared/utils/remotePath';
import { listClaudeCapabilityCatalog } from '../claude/CapabilityCatalogService';
import {
  type CapabilityMcpConfigEntry,
  type CapabilityMcpConfigSet,
  resolveCapabilityMcpConfigEntries,
} from '../claude/CapabilityMcpConfigService';
import { resolveClaudePolicy } from '../claude/ClaudePolicyResolver';
import { filterAgentCapabilityCatalogForProvider } from './AgentCapabilityCatalogSupport';
import type {
  AgentCapabilityProviderAdapter,
  AgentCapabilitySessionOverrides,
  PreparedAgentCapabilityLaunch,
} from './AgentCapabilityProviderAdapter';
import { selectPreferredSkillSourcePathForProvider } from './AgentCapabilitySkillSourceSelection';
import { type CodexRuntimeHomeService, codexRuntimeHomeService } from './CodexRuntimeHomeService';
import {
  applyCodexNativeLaunchAssignments,
  CODEX_WRAPPER_SQLITE_WARNING,
  isCodexShell,
  isCodexThirdPartyWrapperLaunch,
} from './CodexSqliteLaunchOptions';
import { resolveCodexWorkspaceSessionHistoryPath } from './CodexWorkspaceSessionHistory';

export interface CodexCapabilityProviderAdapterDependencies {
  listClaudeCapabilityCatalog?: typeof listClaudeCapabilityCatalog;
  resolveClaudePolicy?: typeof resolveClaudePolicy;
  resolveCapabilityMcpConfigEntries?: typeof resolveCapabilityMcpConfigEntries;
  codexRuntimeHomeService?: Pick<CodexRuntimeHomeService, 'prepareRuntimeHome'>;
}

interface CodexResolvedMcpEntry {
  id: string;
  enabled: boolean;
  config: McpServerConfig;
  sourceScope: ClaudeCapabilitySourceScope;
}

interface CodexResolvedSkillEntry {
  id: string;
  enabled: boolean;
  path: string;
  sourceScope: ClaudeCapabilitySourceScope;
}

interface CodexSessionProjectionResult {
  sessionOverrides?: AgentCapabilitySessionOverrides;
  warnings: string[];
  applied: boolean;
}

const CODEX_BARE_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;
const CHATGPT_NODE_REPL_COMMAND_SUFFIX = '/ChatGPT.app/Contents/Resources/cua_node/bin/node_repl';
const CHATGPT_CODEX_CLI_PATH_SUFFIX = '/ChatGPT.app/Contents/Resources/codex';
type TomlLiteralValue = string | boolean | TomlLiteralValue[] | { [key: string]: TomlLiteralValue };

function normalizeExecutablePath(value: string): string {
  return value.replace(/\\/g, '/');
}

function isChatGptHostedNodeRepl(config: McpServerConfig): boolean {
  if (isHttpMcpConfig(config)) {
    return false;
  }

  const codexCliPath = config.env?.CODEX_CLI_PATH;
  return (
    normalizeExecutablePath(config.command).endsWith(CHATGPT_NODE_REPL_COMMAND_SUFFIX) &&
    typeof codexCliPath === 'string' &&
    normalizeExecutablePath(codexCliPath).endsWith(CHATGPT_CODEX_CLI_PATH_SUFFIX)
  );
}

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

function toTomlKey(key: string): string {
  return CODEX_BARE_KEY_PATTERN.test(key) ? key : JSON.stringify(key);
}

function toTomlLiteral(value: TomlLiteralValue): string {
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => toTomlLiteral(entry)).join(', ')}]`;
  }

  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries
    .map(([key, entryValue]) => `${toTomlKey(key)} = ${toTomlLiteral(entryValue)}`)
    .join(', ')}}`;
}

function buildCodexAssignments(entries: CodexResolvedMcpEntry[]): {
  assignments: string[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const assignments: string[] = [];

  for (const entry of entries.sort((left, right) => left.id.localeCompare(right.id))) {
    if (!CODEX_BARE_KEY_PATTERN.test(entry.id)) {
      warnings.push(
        `Codex MCP id "${entry.id}" uses an unsupported key format and was skipped for runtime injection.`
      );
      continue;
    }

    const prefix = `mcp_servers.${entry.id}`;
    if (isHttpMcpConfig(entry.config)) {
      assignments.push(
        `${prefix}.transport=${toTomlLiteral(entry.config.type)}`,
        `${prefix}.url=${toTomlLiteral(entry.config.url)}`,
        `${prefix}.http_headers=${toTomlLiteral(entry.config.headers ?? {})}`,
        `${prefix}.enabled=${toTomlLiteral(entry.enabled)}`
      );
      continue;
    }

    assignments.push(
      `${prefix}.transport=${toTomlLiteral('stdio')}`,
      `${prefix}.command=${toTomlLiteral(entry.config.command)}`,
      `${prefix}.args=${toTomlLiteral(entry.config.args ?? [])}`,
      `${prefix}.env=${toTomlLiteral(entry.config.env ?? {})}`,
      `${prefix}.enabled=${toTomlLiteral(entry.enabled)}`
    );
  }

  return { assignments, warnings };
}

function buildCodexSkillAssignments(entries: CodexResolvedSkillEntry[]): string[] {
  if (entries.length === 0) {
    return [];
  }

  return [
    `skills.config=${toTomlLiteral(
      entries.map((entry) => ({
        enabled: entry.enabled,
        path: entry.path,
      }))
    )}`,
  ];
}

function isExplicitPolicyDecision(
  resolvedPolicy: ResolvedClaudePolicy,
  capabilityId: string
): boolean {
  const provenance = resolvedPolicy.capabilityProvenance[capabilityId];
  return provenance ? provenance.source !== 'catalog' : true;
}

function buildCodexCliArgs(assignments: string[]): string[] {
  return assignments.flatMap((assignment) => ['-c', assignment]);
}

function chooseCodexConfigEntry(
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
        ? `Codex MCP id "${id}" exists in both shared and personal scopes. The personal scope entry was selected for runtime injection.`
        : `Codex MCP id "${id}" has different shared and personal configurations. The personal scope entry was selected for runtime injection.`
    );
  }

  return personalEntry ?? sharedEntry ?? null;
}

function buildCodexResolvedMcpEntries(
  resolvedPolicy: ResolvedClaudePolicy,
  configs: CapabilityMcpConfigSet
): { entries: CodexResolvedMcpEntry[]; warnings: string[] } {
  const warnings: string[] = [];
  const blockedIds = new Set([
    ...resolvedPolicy.blockedSharedMcpIds,
    ...resolvedPolicy.blockedPersonalMcpIds,
  ]);
  const allowedIds = new Set([
    ...resolvedPolicy.allowedSharedMcpIds,
    ...resolvedPolicy.allowedPersonalMcpIds,
  ]);
  const knownIds = new Set([
    ...Object.keys(configs.sharedById),
    ...Object.keys(configs.personalById),
    ...blockedIds,
    ...allowedIds,
  ]);

  const entries: CodexResolvedMcpEntry[] = [];
  for (const id of [...knownIds].sort((left, right) => left.localeCompare(right))) {
    const selectedEntry = chooseCodexConfigEntry(id, configs, warnings);
    if (!selectedEntry) {
      warnings.push(`Codex MCP id "${id}" has no runtime configuration source and was skipped.`);
      continue;
    }

    if (isChatGptHostedNodeRepl(selectedEntry.config)) {
      warnings.push(
        `Codex MCP id "${id}" is bound to the ChatGPT desktop runtime and was skipped for Infilux.`
      );
      continue;
    }

    entries.push({
      id,
      enabled: !blockedIds.has(id) && allowedIds.has(id),
      config: selectedEntry.config,
      sourceScope: selectedEntry.sourceScope,
    });
  }

  return { entries, warnings };
}

function buildCodexResolvedSkillEntries(
  capabilities: ClaudeCapabilityCatalogItem[],
  resolvedPolicy: ResolvedClaudePolicy
): { entries: CodexResolvedSkillEntry[]; warnings: string[] } {
  const warnings: string[] = [];
  const allowedCapabilityIds = new Set(resolvedPolicy.allowedCapabilityIds);
  const blockedCapabilityIds = new Set(resolvedPolicy.blockedCapabilityIds);
  const skillEntries: CodexResolvedSkillEntry[] = [];

  for (const capability of capabilities) {
    if (capability.kind !== 'legacy-skill') {
      continue;
    }

    const enabled = allowedCapabilityIds.has(capability.id);
    const blocked = blockedCapabilityIds.has(capability.id);
    if (!enabled && !blocked) {
      continue;
    }
    if (!isExplicitPolicyDecision(resolvedPolicy, capability.id)) {
      continue;
    }

    const sourcePaths = [
      ...new Set([
        ...(capability.sourcePaths ?? []),
        ...(capability.sourcePath ? [capability.sourcePath] : []),
      ]),
    ].sort((left, right) => left.localeCompare(right));

    if (sourcePaths.length === 0) {
      warnings.push(
        `Codex skill "${capability.id}" does not expose a source path and was skipped for runtime injection.`
      );
      continue;
    }

    const preferredSourcePath = selectPreferredSkillSourcePathForProvider({
      provider: 'codex',
      capability,
      repoPath: resolvedPolicy.repoPath,
      worktreePath: resolvedPolicy.worktreePath,
    });
    // Explicit blocks must cover every duplicate source; allows only need the provider-preferred path.
    const injectedSourcePaths = enabled
      ? preferredSourcePath
        ? [preferredSourcePath]
        : sourcePaths
      : sourcePaths;

    for (const sourcePath of injectedSourcePaths) {
      skillEntries.push({
        id: capability.id,
        enabled,
        path: sourcePath,
        sourceScope: capability.sourceScope,
      });
    }
  }

  return {
    entries: skillEntries.sort((left, right) => left.id.localeCompare(right.id)),
    warnings,
  };
}

export function buildCodexSessionProjection(
  sessionOptions: SessionCreateOptions,
  capabilities: ClaudeCapabilityCatalogItem[],
  resolvedPolicy: ResolvedClaudePolicy,
  configs: CapabilityMcpConfigSet
): CodexSessionProjectionResult {
  const { entries: mcpEntries, warnings: mcpWarnings } = buildCodexResolvedMcpEntries(
    resolvedPolicy,
    configs
  );
  const { entries: skillEntries, warnings: skillWarnings } = buildCodexResolvedSkillEntries(
    capabilities,
    resolvedPolicy
  );
  const { assignments: mcpAssignments, warnings: assignmentWarnings } =
    buildCodexAssignments(mcpEntries);
  const skillAssignments = buildCodexSkillAssignments(skillEntries);
  const assignments = [...mcpAssignments, ...skillAssignments];
  const allWarnings = [...mcpWarnings, ...skillWarnings, ...assignmentWarnings];

  if (assignments.length === 0) {
    return {
      warnings: allWarnings,
      applied: false,
    };
  }

  if (
    sessionOptions.codexLaunch?.kind === 'native' &&
    sessionOptions.codexLaunch.layout === 'tmux-attach'
  ) {
    allWarnings.push(
      'Codex capability configuration was not applied to an existing tmux session. Restart this Codex session to apply MCP and skill changes.'
    );
    return { warnings: allWarnings, applied: false };
  }

  const cliArgs = buildCodexCliArgs(assignments);
  const sessionOverrides: AgentCapabilitySessionOverrides = {
    metadata: {
      providerLaunchStrategy: 'codex-runtime-config',
      codexMcpServerIds: mcpEntries.map((entry) => entry.id),
      codexSkillIds: [...new Set(skillEntries.map((entry) => entry.id))],
    },
  };

  if (sessionOptions.codexLaunch?.kind === 'native') {
    try {
      const updated = applyCodexNativeLaunchAssignments(sessionOptions, assignments);
      return {
        sessionOverrides: {
          ...sessionOverrides,
          ...(updated.args ? { args: updated.args } : {}),
          ...(updated.fallbackArgs ? { fallbackArgs: updated.fallbackArgs } : {}),
          ...(updated.initialCommand ? { initialCommand: updated.initialCommand } : {}),
          codexLaunch: updated.codexLaunch,
        },
        warnings: allWarnings,
        applied: true,
      };
    } catch {
      allWarnings.push(
        'Codex runtime capability injection could not match the current session launch shape. Restart the session with a standard Codex launch command to apply MCP overrides.'
      );
      return { warnings: allWarnings, applied: false };
    }
  }
  if (sessionOptions.codexLaunch?.kind === 'wrapper') {
    allWarnings.push(
      'Codex runtime capability injection is unavailable for Hapi/Happy wrapper launches.'
    );
    return { warnings: allWarnings, applied: false };
  }

  if (
    isCodexShell(sessionOptions.shell) &&
    !sessionOptions.fallbackArgs &&
    !sessionOptions.fallbackShell &&
    !sessionOptions.initialCommand
  ) {
    sessionOverrides.args = [...cliArgs, ...(sessionOptions.args ?? [])];
    return {
      sessionOverrides,
      warnings: allWarnings,
      applied: true,
    };
  }

  allWarnings.push(
    'Codex runtime capability injection could not match the current session launch shape. Restart the session with a standard Codex launch command to apply MCP overrides.'
  );

  return {
    warnings: allWarnings,
    applied: false,
  };
}

export function createCodexCapabilityProviderAdapter(
  dependencies: CodexCapabilityProviderAdapterDependencies = {}
): AgentCapabilityProviderAdapter {
  const listCatalog = dependencies.listClaudeCapabilityCatalog ?? listClaudeCapabilityCatalog;
  const resolvePolicy = dependencies.resolveClaudePolicy ?? resolveClaudePolicy;
  const resolveMcpConfigs =
    dependencies.resolveCapabilityMcpConfigEntries ?? resolveCapabilityMcpConfigEntries;
  const runtimeHomeService = dependencies.codexRuntimeHomeService ?? codexRuntimeHomeService;

  return {
    provider: 'codex',
    async prepareLaunch(
      request: AgentCapabilityLaunchRequest,
      sessionOptions: SessionCreateOptions
    ): Promise<PreparedAgentCapabilityLaunch> {
      const discoveredCatalog = await listCatalog({
        repoPath: request.repoPath,
        worktreePath: request.worktreePath,
      });
      const catalog = filterAgentCapabilityCatalogForProvider(discoveredCatalog, 'codex');
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
      const projection = buildCodexSessionProjection(
        sessionOptions,
        catalog.capabilities,
        resolvedPolicy,
        mcpConfigs
      );
      const isWrapperLaunch = isCodexThirdPartyWrapperLaunch(sessionOptions);
      const uiSessionId =
        typeof sessionOptions.metadata?.uiSessionId === 'string' &&
        sessionOptions.metadata.uiSessionId.length > 0
          ? sessionOptions.metadata.uiSessionId
          : undefined;
      const hasUserOwnedHome =
        Boolean(sessionOptions.env?.CODEX_HOME) &&
        sessionOptions.env?.CODEX_HOME !== sessionOptions.env?.INFILUX_MANAGED_CODEX_RUNTIME_HOME;
      const runtimeWorktreePath = sessionOptions.cwd ?? request.worktreePath;
      const runtimeHome = hasUserOwnedHome
        ? null
        : await runtimeHomeService.prepareRuntimeHome(
            uiSessionId ?? `${runtimeWorktreePath}:${Date.now()}`,
            {
              sessionHistoryPath: resolveCodexWorkspaceSessionHistoryPath({
                repoPath: request.repoPath,
                worktreePath: runtimeWorktreePath,
              }),
              sessionHistoryScope: {
                repoPath: request.repoPath,
                worktreePath: runtimeWorktreePath,
              },
            }
          );
      const warnings =
        isWrapperLaunch && runtimeHome
          ? [...projection.warnings, CODEX_WRAPPER_SQLITE_WARNING]
          : projection.warnings;
      const sessionOverrides: AgentCapabilitySessionOverrides = {
        ...(projection.sessionOverrides ?? {}),
        env: {
          ...(projection.sessionOverrides?.env ?? {}),
          ...(runtimeHome
            ? {
                CODEX_HOME: runtimeHome.homePath,
                ...(!isRemoteVirtualPath(runtimeWorktreePath) && !isWrapperLaunch
                  ? { CODEX_SQLITE_HOME: runtimeHome.sqliteHomePath }
                  : {}),
                INFILUX_MANAGED_CODEX_RUNTIME_HOME: runtimeHome.homePath,
              }
            : {}),
        },
        metadata: {
          ...(projection.sessionOverrides?.metadata ?? {}),
          ...(runtimeHome
            ? {
                codexRuntimeHome: {
                  homePath: runtimeHome.homePath,
                  sourceHomePath: runtimeHome.sourceHomePath,
                },
              }
            : {}),
        },
      };

      return {
        launchResult: {
          provider: 'codex',
          repoPath: request.repoPath,
          worktreePath: request.worktreePath,
          hash: resolvedPolicy.hash,
          warnings,
          resolvedPolicy,
          projected: {
            hash: resolvedPolicy.hash,
            materializationMode: 'provider-native',
            applied: projection.applied,
            updatedFiles: [],
            warnings,
            errors: [],
          },
          policyHash: resolvedPolicy.hash,
          appliedAt: Date.now(),
        },
        sessionOverrides,
      };
    },
  };
}

export const codexCapabilityProviderAdapter = createCodexCapabilityProviderAdapter();
