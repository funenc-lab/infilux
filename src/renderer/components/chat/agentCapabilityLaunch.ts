import type {
  AgentCapabilityLaunchRequest,
  AgentCapabilityProvider,
  ClaudeGlobalPolicy,
  ClaudePolicyConfig,
  ClaudePolicyMaterializationMode,
  ClaudeProjectPolicy,
  ClaudeWorktreePolicy,
} from '@shared/types';
import {
  resolveAgentCapabilityPolicyMaterializationMode,
  resolveAgentCapabilityPolicyProvider,
} from '@shared/utils/agentCapabilityPolicy';

interface BuildAgentCapabilityLaunchMetadataParams {
  agentId?: string;
  agentCommand?: string;
  repoPath?: string;
  worktreePath?: string;
  globalPolicy?: ClaudeGlobalPolicy | null;
  projectPolicy: ClaudeProjectPolicy | null;
  worktreePolicy: ClaudeWorktreePolicy | null;
  sessionPolicy?: ClaudePolicyConfig | null;
  materializationMode?: ClaudePolicyMaterializationMode;
  metadata?: Record<string, unknown>;
}

export function buildAgentCapabilityLaunchRequest(
  params: BuildAgentCapabilityLaunchMetadataParams
): AgentCapabilityLaunchRequest | null {
  const provider = resolveAgentCapabilityPolicyProvider(params.agentId, params.agentCommand);
  if (!provider || !params.repoPath || !params.worktreePath) {
    return null;
  }

  return {
    provider,
    agentId: params.agentId,
    agentCommand: params.agentCommand,
    repoPath: params.repoPath,
    worktreePath: params.worktreePath,
    globalPolicy: params.globalPolicy ?? null,
    projectPolicy: params.projectPolicy,
    worktreePolicy: params.worktreePolicy,
    sessionPolicy: params.sessionPolicy ?? null,
    materializationMode:
      params.materializationMode ??
      resolveAgentCapabilityPolicyMaterializationMode(params.agentId, params.agentCommand),
  };
}

export interface ExtractedAgentCapabilitySessionMetadata {
  provider: AgentCapabilityProvider;
  hash: string;
  warnings: string[];
}

function isAgentCapabilityProvider(value: unknown): value is AgentCapabilityProvider {
  return value === 'claude' || value === 'codex' || value === 'gemini';
}

export function extractAgentCapabilitySessionMetadata(
  metadata: Record<string, unknown> | undefined
): ExtractedAgentCapabilitySessionMetadata | null {
  const candidate = metadata?.agentCapability;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return null;
  }

  const provider = (candidate as { provider?: unknown }).provider;
  const hash = (candidate as { hash?: unknown }).hash;
  if (!isAgentCapabilityProvider(provider) || typeof hash !== 'string' || !hash) {
    return null;
  }

  const warnings = Array.isArray((candidate as { warnings?: unknown }).warnings)
    ? (candidate as { warnings: unknown[] }).warnings.filter(
        (warning): warning is string => typeof warning === 'string'
      )
    : [];

  return {
    provider,
    hash,
    warnings,
  };
}

export function buildAgentCapabilityLaunchMetadata(
  params: BuildAgentCapabilityLaunchMetadataParams
): Record<string, unknown> | undefined {
  const launchRequest = buildAgentCapabilityLaunchRequest(params);
  if (!launchRequest) {
    return params.metadata;
  }

  return {
    ...(params.metadata ?? {}),
    agentCapabilityLaunch: launchRequest,
  };
}
