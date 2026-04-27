import type { McpTransportType } from './mcp';

export type ClaudeCapabilityKind = 'subagent' | 'command' | 'legacy-skill' | 'mcp';
export type ClaudeCapabilitySourceScope = 'system' | 'user' | 'project' | 'worktree' | 'remote';
export type ClaudeMcpCatalogScope = 'shared' | 'personal';
export type ClaudePolicyDecision = 'allow' | 'block';
export type ClaudePolicyMaterializationMode = 'copy' | 'symlink' | 'provider-native';
export type ClaudePolicyProvenanceSource =
  | 'catalog'
  | 'global-policy'
  | 'project-policy'
  | 'worktree-policy'
  | 'session-policy';

export interface ClaudeCapabilityCatalogItem {
  id: string;
  kind: ClaudeCapabilityKind;
  name: string;
  description?: string;
  sourceScope: ClaudeCapabilitySourceScope;
  sourcePath?: string;
  sourcePaths?: string[];
  isAvailable: boolean;
  isConfigurable: boolean;
}

export interface ClaudeMcpCatalogItem {
  id: string;
  name: string;
  description?: string;
  scope: ClaudeMcpCatalogScope;
  sourceScope: ClaudeCapabilitySourceScope;
  sourcePath?: string;
  transportType?: McpTransportType;
  isAvailable: boolean;
  isConfigurable: boolean;
}

export interface ClaudeCapabilityCatalog {
  capabilities: ClaudeCapabilityCatalogItem[];
  sharedMcpServers: ClaudeMcpCatalogItem[];
  personalMcpServers: ClaudeMcpCatalogItem[];
  generatedAt: number;
}

export interface ClaudePolicyCatalogRequest {
  repoPath?: string;
  worktreePath?: string;
}

export interface ClaudePolicyConfig {
  allowedCapabilityIds: string[];
  blockedCapabilityIds: string[];
  allowedSharedMcpIds: string[];
  blockedSharedMcpIds: string[];
  allowedPersonalMcpIds: string[];
  blockedPersonalMcpIds: string[];
  updatedAt: number;
}

export interface ClaudeProjectPolicy extends ClaudePolicyConfig {
  repoPath: string;
}

export interface ClaudeGlobalPolicy extends ClaudePolicyConfig {}

export interface ClaudeWorktreePolicy extends ClaudePolicyConfig {
  repoPath: string;
  worktreePath: string;
}

export interface ClaudePolicyProvenance {
  source: ClaudePolicyProvenanceSource;
  decision: ClaudePolicyDecision;
}

export interface ResolvedClaudePolicy {
  repoPath: string;
  worktreePath: string;
  allowedCapabilityIds: string[];
  blockedCapabilityIds: string[];
  allowedSharedMcpIds: string[];
  blockedSharedMcpIds: string[];
  allowedPersonalMcpIds: string[];
  blockedPersonalMcpIds: string[];
  capabilityProvenance: Record<string, ClaudePolicyProvenance>;
  sharedMcpProvenance: Record<string, ClaudePolicyProvenance>;
  personalMcpProvenance: Record<string, ClaudePolicyProvenance>;
  hash: string;
  policyHash: string;
}

export interface ResolveClaudePolicyPreviewRequest {
  repoPath: string;
  worktreePath: string;
  globalPolicy?: ClaudeGlobalPolicy | null;
  projectPolicy: ClaudeProjectPolicy | null;
  worktreePolicy: ClaudeWorktreePolicy | null;
}

export type ResolveClaudePolicyPreviewResult = ResolvedClaudePolicy;

export interface PrepareClaudePolicyLaunchRequest extends ResolveClaudePolicyPreviewRequest {
  agentId?: string;
  agentCommand?: string;
  sessionPolicy?: ClaudePolicyConfig | null;
  materializationMode?: ClaudePolicyMaterializationMode;
}

export interface ClaudeRuntimeProjectionResult {
  hash: string;
  materializationMode: ClaudePolicyMaterializationMode;
  applied: boolean;
  updatedFiles: string[];
  warnings: string[];
  errors: string[];
}

export interface PrepareClaudePolicyLaunchResult {
  repoPath: string;
  worktreePath: string;
  hash: string;
  warnings: string[];
  resolvedPolicy: ResolvedClaudePolicy;
  projected: ClaudeRuntimeProjectionResult;
  policyHash?: string;
  appliedAt?: number;
}
