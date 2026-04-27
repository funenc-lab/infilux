import * as path from 'node:path';
import type { McpServerConfig, ResolvedClaudePolicy, SessionCreateOptions } from '@shared/types';
import type { AgentCapabilitySessionOverrides } from '../agent/AgentCapabilityProviderAdapter';
import type {
  CapabilityMcpConfigEntry,
  CapabilityMcpConfigSet,
} from './CapabilityMcpConfigService';

interface ClaudeNativeMcpProjectionResult {
  sessionOverrides?: AgentCapabilitySessionOverrides;
  warnings: string[];
  applied: boolean;
}

const CLAUDE_TOKEN_PATTERN = /(^|[\s'"])((?:[^\s'"`]+\/)?claude(?:\.exe)?)(?=(?:[\s'"]|$))/i;

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

function stableJsonStringify(value: unknown): string {
  return JSON.stringify(toStableValue(value));
}

function quotePosixDouble(input: string): string {
  return `"${input.replace(/["\\$`]/g, '\\$&')}"`;
}

function quotePowerShellSingle(input: string): string {
  return `'${input.replace(/'/g, "''")}'`;
}

function injectClaudeShellFragment(command: string, shellFragment: string): string | null {
  if (!command.trim()) {
    return null;
  }

  let applied = false;
  const updated = command.replace(CLAUDE_TOKEN_PATTERN, (_fullMatch, prefix, executable) => {
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
  const updatedCommand = injectClaudeShellFragment(args[lastIndex] ?? '', shellFragment);
  if (!updatedCommand) {
    return undefined;
  }

  const nextArgs = [...args];
  nextArgs[lastIndex] = updatedCommand;
  return nextArgs;
}

function isClaudeShell(shell: string | undefined): boolean {
  if (!shell) {
    return false;
  }

  const fileName = path.basename(shell).toLowerCase();
  return fileName === 'claude' || fileName === 'claude.exe';
}

function chooseMcpConfigEntry(
  id: string,
  configs: CapabilityMcpConfigSet,
  warnings: string[]
): CapabilityMcpConfigEntry | null {
  const sharedEntry = configs.sharedById[id];
  const personalEntry = configs.personalById[id];

  if (sharedEntry && personalEntry) {
    const sharedConfig = stableJsonStringify(sharedEntry.config);
    const personalConfig = stableJsonStringify(personalEntry.config);
    warnings.push(
      sharedConfig === personalConfig
        ? `Claude MCP id "${id}" exists in both shared and personal scopes. The personal scope entry was selected for native launch injection.`
        : `Claude MCP id "${id}" has different shared and personal configurations. The personal scope entry was selected for native launch injection.`
    );
  }

  return personalEntry ?? sharedEntry ?? null;
}

function buildNativeMcpPayload(
  resolvedPolicy: ResolvedClaudePolicy,
  configs: CapabilityMcpConfigSet
): {
  shouldInject: boolean;
  serverIds: string[];
  mcpConfigJson: string;
  warnings: string[];
} {
  const warnings: string[] = [];
  const allowedIds = new Set([
    ...resolvedPolicy.allowedSharedMcpIds,
    ...resolvedPolicy.allowedPersonalMcpIds,
  ]);
  const blockedIds = new Set([
    ...resolvedPolicy.blockedSharedMcpIds,
    ...resolvedPolicy.blockedPersonalMcpIds,
  ]);
  const knownIds = new Set([
    ...Object.keys(configs.sharedById),
    ...Object.keys(configs.personalById),
    ...allowedIds,
    ...blockedIds,
  ]);

  if (knownIds.size === 0) {
    return {
      shouldInject: false,
      serverIds: [],
      mcpConfigJson: stableJsonStringify({ mcpServers: {} }),
      warnings,
    };
  }

  const selectedConfigs: Record<string, McpServerConfig> = {};
  for (const id of [...knownIds].sort((left, right) => left.localeCompare(right))) {
    if (!allowedIds.has(id) || blockedIds.has(id)) {
      continue;
    }

    const selectedEntry = chooseMcpConfigEntry(id, configs, warnings);
    if (!selectedEntry) {
      warnings.push(`Claude MCP id "${id}" has no runtime configuration source and was skipped.`);
      continue;
    }

    selectedConfigs[id] = selectedEntry.config;
  }

  return {
    shouldInject: true,
    serverIds: Object.keys(selectedConfigs).sort((left, right) => left.localeCompare(right)),
    mcpConfigJson: stableJsonStringify({ mcpServers: selectedConfigs }),
    warnings,
  };
}

function buildClaudeShellFragment(mcpConfigJson: string, style: 'posix' | 'powershell'): string {
  if (style === 'powershell') {
    return `--mcp-config ${quotePowerShellSingle(mcpConfigJson)} --strict-mcp-config`;
  }

  return `--mcp-config ${quotePosixDouble(mcpConfigJson)} --strict-mcp-config`;
}

function buildProjectionMetadata(serverIds: string[]): Record<string, unknown> {
  return {
    providerLaunchStrategy: 'claude-native-mcp-config',
    claudeMcpServerIds: serverIds,
    claudeNativeMcpStrict: true,
  };
}

export function buildClaudeNativeMcpSessionOverrides(
  sessionOptions: SessionCreateOptions,
  resolvedPolicy: ResolvedClaudePolicy,
  configs: CapabilityMcpConfigSet
): ClaudeNativeMcpProjectionResult {
  const payload = buildNativeMcpPayload(resolvedPolicy, configs);
  if (!payload.shouldInject) {
    return {
      warnings: payload.warnings,
      applied: false,
    };
  }

  const cliArgs = ['--mcp-config', payload.mcpConfigJson, '--strict-mcp-config'];
  const shellType = sessionOptions.shellConfig?.shellType;
  const shellStyle =
    shellType === 'powershell' || shellType === 'powershell7' ? 'powershell' : 'posix';
  const shellFragment = buildClaudeShellFragment(payload.mcpConfigJson, shellStyle);
  const sessionOverrides: AgentCapabilitySessionOverrides = {
    metadata: buildProjectionMetadata(payload.serverIds),
  };

  if (isClaudeShell(sessionOptions.shell)) {
    sessionOverrides.args = [...cliArgs, ...(sessionOptions.args ?? [])];
    const fallbackArgs = patchTrailingCommandArg(sessionOptions.fallbackArgs, shellFragment);
    if (fallbackArgs) {
      sessionOverrides.fallbackArgs = fallbackArgs;
    }

    return {
      sessionOverrides,
      warnings: payload.warnings,
      applied: true,
    };
  }

  if (shellType === 'cmd' || shellType === 'wsl') {
    return {
      warnings: [
        ...payload.warnings,
        'Claude native MCP injection could not match the current session launch shape. Falling back to workspace MCP projection for this session.',
      ],
      applied: false,
    };
  }

  if (sessionOptions.initialCommand) {
    const updatedInitialCommand = injectClaudeShellFragment(
      sessionOptions.initialCommand,
      shellFragment
    );
    if (updatedInitialCommand) {
      sessionOverrides.initialCommand = updatedInitialCommand;
      const fallbackArgs = patchTrailingCommandArg(sessionOptions.fallbackArgs, shellFragment);
      if (fallbackArgs) {
        sessionOverrides.fallbackArgs = fallbackArgs;
      }

      return {
        sessionOverrides,
        warnings: payload.warnings,
        applied: true,
      };
    }
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
      warnings: payload.warnings,
      applied: true,
    };
  }

  return {
    warnings: [
      ...payload.warnings,
      'Claude native MCP injection could not match the current session launch shape. Falling back to workspace MCP projection for this session.',
    ],
    applied: false,
  };
}
