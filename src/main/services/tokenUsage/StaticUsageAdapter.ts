import type { TokenUsageProviderStatus } from '@shared/types/tokenUsage';
import type { TokenUsageAdapter, TokenUsageCollectionResult } from './TokenUsageTypes';

export class StaticUsageAdapter implements TokenUsageAdapter {
  private readonly status: TokenUsageProviderStatus;

  constructor(status: TokenUsageProviderStatus) {
    this.status = status;
  }

  async collect(): Promise<TokenUsageCollectionResult> {
    return {
      status: this.status,
      sessions: [],
    };
  }
}
