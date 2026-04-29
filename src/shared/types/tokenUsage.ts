import type { AgentFamily } from './agentCatalog';

export type TokenUsageProviderId =
  | 'claude-code'
  | 'codex-cli'
  | 'gemini-cli'
  | 'cursor-cli'
  | 'droid'
  | 'auggie'
  | 'opencode'
  | 'custom';

export type TokenUsageProviderStatusKind = 'available' | 'not-found' | 'unsupported' | 'error';

export type TokenUsageSource = 'claude-jsonl' | 'claude-status-line' | 'codex-jsonl';

export interface TokenUsageCounts {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  cachedInputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
}

export interface TokenUsageProviderStatus {
  providerId: TokenUsageProviderId;
  agentFamily: AgentFamily;
  label: string;
  status: TokenUsageProviderStatusKind;
  reason?: string;
}

export interface TokenUsageSessionSummary {
  sessionId: string;
  providerId: TokenUsageProviderId;
  agentFamily: AgentFamily;
  source: TokenUsageSource;
  projectPath: string;
  cwd: string;
  model?: string;
  startedAt: number;
  updatedAt: number;
  counts: TokenUsageCounts;
}

export interface TokenUsageProviderSummary {
  providerId: TokenUsageProviderId;
  agentFamily: AgentFamily;
  label: string;
  sessionCount: number;
  totals: TokenUsageCounts;
}

export interface TokenUsageProjectSummary {
  projectPath: string;
  sessionCount: number;
  updatedAt: number;
  totals: TokenUsageCounts;
  providers: TokenUsageProviderSummary[];
  sessions?: TokenUsageSessionSummary[];
}

export interface GetProjectTokenUsageRequest {
  projectPaths?: string[];
  includeSessions?: boolean;
  forceRefresh?: boolean;
}

export type ProjectTokenUsageSnapshotFreshnessSource = 'scan' | 'cache';

export interface ProjectTokenUsageSnapshotFreshness {
  source: ProjectTokenUsageSnapshotFreshnessSource;
  cachedAt: number;
  cacheTtlMs: number;
  isStale: boolean;
  backgroundRefresh: boolean;
}

export interface ProjectTokenUsageSnapshot {
  generatedAt: number;
  freshness?: ProjectTokenUsageSnapshotFreshness;
  providerStatuses: TokenUsageProviderStatus[];
  projects: TokenUsageProjectSummary[];
}

export interface ProjectTokenUsageUpdatedEvent {
  request: GetProjectTokenUsageRequest;
  snapshot: ProjectTokenUsageSnapshot;
}
