import type {
  AgentCapabilityLaunchRequest,
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
