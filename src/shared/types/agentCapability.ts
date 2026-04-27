import type {
  ClaudeGlobalPolicy,
  ClaudePolicyConfig,
  ClaudePolicyMaterializationMode,
  ClaudeProjectPolicy,
  ClaudeRuntimeProjectionResult,
  ClaudeWorktreePolicy,
  ResolvedClaudePolicy,
} from './claudePolicy';

export type AgentCapabilityProvider = 'claude' | 'codex' | 'gemini';

export interface AgentCapabilityLaunchRequest {
  provider: AgentCapabilityProvider;
  agentId?: string;
  agentCommand?: string;
  repoPath: string;
  worktreePath: string;
  globalPolicy?: ClaudeGlobalPolicy | null;
  projectPolicy: ClaudeProjectPolicy | null;
  worktreePolicy: ClaudeWorktreePolicy | null;
  sessionPolicy?: ClaudePolicyConfig | null;
  materializationMode?: ClaudePolicyMaterializationMode;
}

export interface AgentCapabilityLaunchResult {
  provider: AgentCapabilityProvider;
  repoPath: string;
  worktreePath: string;
  hash: string;
  warnings: string[];
  resolvedPolicy?: ResolvedClaudePolicy;
  projected?: ClaudeRuntimeProjectionResult;
  policyHash?: string;
  appliedAt?: number;
}
