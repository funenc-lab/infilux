import * as path from 'node:path';
import type {
  AgentCapabilityLaunchRequest,
  ClaudeCapabilityCatalogItem,
  ClaudeCapabilitySourceScope,
  McpServerConfig,
  ResolvedClaudePolicy,
  SessionCreateOptions,
} from '@shared/types';
import { isHttpMcpConfig } from '@shared/types';
import { listClaudeCapabilityCatalog } from '../claude/CapabilityCatalogService';
import {
  type CapabilityMcpConfigEntry,
  type CapabilityMcpConfigSet,
  resolveCapabilityMcpConfigEntries,
} from '../claude/CapabilityMcpConfigService';
import { resolveClaudePolicy } from '../claude/ClaudePolicyResolver';
import type {
  AgentCapabilityProviderAdapter,
  AgentCapabilitySessionOverrides,
  PreparedAgentCapabilityLaunch,
} from './AgentCapabilityProviderAdapter';

export interface CodexCapabilityProviderAdapterDependencies {
  listClaudeCapabilityCatalog?: typeof listClaudeCapabilityCatalog;
  resolveClaudePolicy?: typeof resolveClaudePolicy;
  resolveCapabilityMcpConfigEntries?: typeof resolveCapabilityMcpConfigEntries;
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
const CODEX_TOKEN_PATTERN = /(^|[\s'"])((?:[^\s'"`]+\/)?codex(?:\.exe)?)(?=(?:[\s'"]|$))/i;
type TomlLiteralValue = string | boolean | TomlLiteralValue[] | { [key: string]: TomlLiteralValue };

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

function quotePosixDouble(input: string): string {
  return `"${input.replace(/["\\$`]/g, '\\$&')}"`;
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

function buildCodexCliArgs(assignments: string[]): string[] {
  return assignments.flatMap((assignment) => ['-c', assignment]);
}

function buildCodexShellFragment(assignments: string[]): string {
  return assignments.map((assignment) => `-c ${quotePosixDouble(assignment)}`).join(' ');
}

function injectCodexShellFragment(command: string, shellFragment: string): string | null {
  if (!command.trim()) {
    return null;
  }

  let applied = false;
  const updated = command.replace(CODEX_TOKEN_PATTERN, (_fullMatch, prefix, executable) => {
    applied = true;
    return `${prefix}${executable} ${shellFragment}`;
  });

  return applied ? updated : null;
}

function patchTrailingCommandArg(
  args: string[] | undefined,
  shellFragment: string
): string[] | undefined {
  if (!args || args.length === 0) {
    return undefined;
  }

  const lastIndex = args.length - 1;
  const updatedCommand = injectCodexShellFragment(args[lastIndex] ?? '', shellFragment);
  if (!updatedCommand) {
    return undefined;
  }

  const nextArgs = [...args];
  nextArgs[lastIndex] = updatedCommand;
  return nextArgs;
}

function isCodexShell(shell: string | undefined): boolean {
  if (!shell) {
    return false;
  }

  const fileName = path.basename(shell).toLowerCase();
  return fileName === 'codex' || fileName === 'codex.exe';
}

function isUnsupportedShellConfig(sessionOptions: SessionCreateOptions): boolean {
  const shellType = sessionOptions.shellConfig?.shellType;
  return (
    shellType === 'powershell' ||
    shellType === 'powershell7' ||
    shellType === 'cmd' ||
    shellType === 'wsl'
  );
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

    entries.push({
      id,
      enabled: !blockedIds.has(id) && allowedIds.has(id),
      config: selectedEntry.config,
      sourceScope: selectedEntry.sourceScope,
    });
  }

  return { entries, warnings };
}

function summarizeCapabilityIds(ids: string[], limit = 3): string {
  if (ids.length <= limit) {
    return ids.join(', ');
  }

  const visibleIds = ids.slice(0, limit);
  return `${visibleIds.join(', ')} (+${ids.length - limit} more)`;
}

function buildCodexResolvedSkillEntries(
  capabilities: ClaudeCapabilityCatalogItem[],
  resolvedPolicy: ResolvedClaudePolicy
): { entries: CodexResolvedSkillEntry[]; warnings: string[] } {
  const warnings: string[] = [];
  const allowedCapabilityIds = new Set(resolvedPolicy.allowedCapabilityIds);
  const skillEntries: CodexResolvedSkillEntry[] = [];

  for (const capability of capabilities) {
    if (capability.kind !== 'legacy-skill') {
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

    for (const sourcePath of sourcePaths) {
      skillEntries.push({
        id: capability.id,
        enabled: allowedCapabilityIds.has(capability.id),
        path: sourcePath,
        sourceScope: capability.sourceScope,
      });
    }
  }

  const unsupportedCapabilityIds = capabilities
    .filter((capability) => capability.kind !== 'legacy-skill')
    .map((capability) => capability.id)
    .sort((left, right) => left.localeCompare(right));
  const unsupportedRestrictedIds = unsupportedCapabilityIds.filter(
    (id) => !allowedCapabilityIds.has(id)
  );

  if (unsupportedRestrictedIds.length > 0) {
    warnings.push(
      `Codex runtime capability injection currently supports SKILL.md capabilities only. Command and subagent restrictions were not enforced for: ${summarizeCapabilityIds(unsupportedRestrictedIds)}.`
    );
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

  const cliArgs = buildCodexCliArgs(assignments);
  const shellFragment = buildCodexShellFragment(assignments);
  const sessionOverrides: AgentCapabilitySessionOverrides = {
    metadata: {
      providerLaunchStrategy: 'codex-runtime-config',
      codexMcpServerIds: mcpEntries.map((entry) => entry.id),
      codexSkillIds: [...new Set(skillEntries.map((entry) => entry.id))],
    },
  };

  if (isCodexShell(sessionOptions.shell)) {
    sessionOverrides.args = [...cliArgs, ...(sessionOptions.args ?? [])];
    const fallbackArgs = patchTrailingCommandArg(sessionOptions.fallbackArgs, shellFragment);
    if (fallbackArgs) {
      sessionOverrides.fallbackArgs = fallbackArgs;
    }

    return {
      sessionOverrides,
      warnings: allWarnings,
      applied: true,
    };
  }

  if (!isUnsupportedShellConfig(sessionOptions)) {
    const updatedInitialCommand = sessionOptions.initialCommand
      ? injectCodexShellFragment(sessionOptions.initialCommand, shellFragment)
      : null;
    if (updatedInitialCommand) {
      sessionOverrides.initialCommand = updatedInitialCommand;
      const fallbackArgs = patchTrailingCommandArg(sessionOptions.fallbackArgs, shellFragment);
      if (fallbackArgs) {
        sessionOverrides.fallbackArgs = fallbackArgs;
      }

      return {
        sessionOverrides,
        warnings: allWarnings,
        applied: true,
      };
    }

    const updatedArgs = patchTrailingCommandArg(sessionOptions.args, shellFragment);
    if (updatedArgs) {
      sessionOverrides.args = updatedArgs;
      const fallbackArgs = patchTrailingCommandArg(sessionOptions.fallbackArgs, shellFragment);
      if (fallbackArgs) {
        sessionOverrides.fallbackArgs = fallbackArgs;
      }

      return {
        sessionOverrides,
        warnings: allWarnings,
        applied: true,
      };
    }
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

  return {
    provider: 'codex',
    async prepareLaunch(
      request: AgentCapabilityLaunchRequest,
      sessionOptions: SessionCreateOptions
    ): Promise<PreparedAgentCapabilityLaunch> {
      const catalog = await listCatalog({
        repoPath: request.repoPath,
        worktreePath: request.worktreePath,
      });
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

      return {
        launchResult: {
          provider: 'codex',
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
          appliedAt: Date.now(),
        },
        sessionOverrides: projection.sessionOverrides,
      };
    },
  };
}

export const codexCapabilityProviderAdapter = createCodexCapabilityProviderAdapter();
