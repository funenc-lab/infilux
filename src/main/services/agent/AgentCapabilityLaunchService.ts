import type {
  AgentCapabilityLaunchRequest,
  AgentCapabilityProvider,
  ClaudeGlobalPolicy,
  ClaudePolicyConfig,
  ClaudePolicyMaterializationMode,
  ClaudeProjectPolicy,
  ClaudeWorktreePolicy,
  SessionCreateOptions,
} from '@shared/types';
import { claudeCapabilityProviderAdapter } from '../claude/ClaudeCapabilityProviderAdapter';
import type {
  AgentCapabilityProviderAdapter,
  PreparedAgentCapabilityLaunch,
} from './AgentCapabilityProviderAdapter';
import { codexCapabilityProviderAdapter } from './CodexCapabilityProviderAdapter';
import { geminiCapabilityProviderAdapter } from './GeminiCapabilityProviderAdapter';

export interface AgentCapabilityLaunchServiceDependencies {
  resolveAdapter?: (provider: AgentCapabilityProvider) => AgentCapabilityProviderAdapter | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeProvider(value: unknown): AgentCapabilityProvider | null {
  if (value === 'claude' || value === 'codex' || value === 'gemini') {
    return value;
  }
  return null;
}

function normalizeMaterializationMode(value: unknown): ClaudePolicyMaterializationMode | undefined {
  if (value === 'copy' || value === 'symlink' || value === 'provider-native') {
    return value;
  }
  return undefined;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isClaudePolicyConfig(value: unknown): value is ClaudePolicyConfig {
  return (
    isRecord(value) &&
    isStringArray(value.allowedCapabilityIds) &&
    isStringArray(value.blockedCapabilityIds) &&
    isStringArray(value.allowedSharedMcpIds) &&
    isStringArray(value.blockedSharedMcpIds) &&
    isStringArray(value.allowedPersonalMcpIds) &&
    isStringArray(value.blockedPersonalMcpIds) &&
    typeof value.updatedAt === 'number'
  );
}

function normalizeGlobalPolicy(value: unknown): ClaudeGlobalPolicy | null {
  return isClaudePolicyConfig(value) ? value : null;
}

function isClaudeProjectPolicy(value: unknown): value is ClaudeProjectPolicy {
  return isClaudePolicyConfig(value) && isRecord(value) && typeof value.repoPath === 'string';
}

function isClaudeWorktreePolicy(value: unknown): value is ClaudeWorktreePolicy {
  return (
    isClaudePolicyConfig(value) &&
    isRecord(value) &&
    typeof value.repoPath === 'string' &&
    typeof value.worktreePath === 'string'
  );
}

function normalizeProjectPolicy(value: unknown): ClaudeProjectPolicy | null {
  return isClaudeProjectPolicy(value) ? value : null;
}

function normalizeWorktreePolicy(value: unknown): ClaudeWorktreePolicy | null {
  return isClaudeWorktreePolicy(value) ? value : null;
}

function normalizeSessionPolicy(value: unknown): ClaudePolicyConfig | null {
  return isClaudePolicyConfig(value) ? value : null;
}

function toAgentCapabilityLaunchRequest(
  candidate: Record<string, unknown>,
  provider: AgentCapabilityProvider
): AgentCapabilityLaunchRequest | null {
  if (typeof candidate.repoPath !== 'string' || typeof candidate.worktreePath !== 'string') {
    return null;
  }

  return {
    provider,
    agentId: typeof candidate.agentId === 'string' ? candidate.agentId : undefined,
    agentCommand: typeof candidate.agentCommand === 'string' ? candidate.agentCommand : undefined,
    repoPath: candidate.repoPath,
    worktreePath: candidate.worktreePath,
    globalPolicy: normalizeGlobalPolicy(candidate.globalPolicy),
    projectPolicy: normalizeProjectPolicy(candidate.projectPolicy),
    worktreePolicy: normalizeWorktreePolicy(candidate.worktreePolicy),
    sessionPolicy: normalizeSessionPolicy(candidate.sessionPolicy),
    materializationMode: normalizeMaterializationMode(candidate.materializationMode),
  };
}

const DEFAULT_PROVIDER_ADAPTERS = new Map<AgentCapabilityProvider, AgentCapabilityProviderAdapter>([
  [claudeCapabilityProviderAdapter.provider, claudeCapabilityProviderAdapter],
  [codexCapabilityProviderAdapter.provider, codexCapabilityProviderAdapter],
  [geminiCapabilityProviderAdapter.provider, geminiCapabilityProviderAdapter],
]);

export function resolveAgentCapabilityLaunchRequest(
  metadata: Record<string, unknown> | undefined
): AgentCapabilityLaunchRequest | null {
  const genericCandidate = metadata?.agentCapabilityLaunch;
  if (isRecord(genericCandidate)) {
    const provider = normalizeProvider(genericCandidate.provider);
    if (provider) {
      return toAgentCapabilityLaunchRequest(genericCandidate, provider);
    }
  }

  const legacyClaudeCandidate = metadata?.claudePolicyLaunch;
  if (isRecord(legacyClaudeCandidate)) {
    return toAgentCapabilityLaunchRequest(legacyClaudeCandidate, 'claude');
  }

  return null;
}

export async function prepareAgentCapabilityLaunch(
  request: AgentCapabilityLaunchRequest,
  sessionOptions: SessionCreateOptions,
  dependencies: AgentCapabilityLaunchServiceDependencies = {}
): Promise<PreparedAgentCapabilityLaunch | null> {
  const resolveAdapter =
    dependencies.resolveAdapter ??
    ((provider: AgentCapabilityProvider) => DEFAULT_PROVIDER_ADAPTERS.get(provider) ?? null);
  const adapter = resolveAdapter(request.provider);
  if (!adapter) {
    return null;
  }

  return adapter.prepareLaunch(request, sessionOptions);
}
