import type {
  NormalizedProjectTokenUsageRequest,
  TokenUsageProviderStatus,
  TokenUsageSessionSummary,
} from '@shared/types/tokenUsage';

export interface TokenUsageCollectionResult {
  status: TokenUsageProviderStatus;
  sessions: TokenUsageSessionSummary[];
}

export interface TokenUsageAdapter {
  collect: (request?: NormalizedProjectTokenUsageRequest) => Promise<TokenUsageCollectionResult>;
}
