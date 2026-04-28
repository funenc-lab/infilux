import type {
  GetProjectTokenUsageRequest,
  ProjectTokenUsageSnapshot,
} from '@shared/types/tokenUsage';
import { ClaudeUsageAdapter } from './ClaudeUsageAdapter';
import { CodexUsageAdapter } from './CodexUsageAdapter';
import { StaticUsageAdapter } from './StaticUsageAdapter';
import { buildProjectTokenUsageSnapshot } from './TokenUsageAccumulator';
import type { TokenUsageAdapter } from './TokenUsageTypes';

function createDefaultAdapters(): TokenUsageAdapter[] {
  return [
    new ClaudeUsageAdapter(),
    new CodexUsageAdapter(),
    new StaticUsageAdapter({
      providerId: 'gemini-cli',
      agentFamily: 'gemini',
      label: 'Gemini CLI',
      status: 'unsupported',
      reason: 'No stable token usage log was found for this provider.',
    }),
    new StaticUsageAdapter({
      providerId: 'cursor-cli',
      agentFamily: 'cursor',
      label: 'Cursor CLI',
      status: 'unsupported',
      reason: 'No stable token usage log was found for this provider.',
    }),
    new StaticUsageAdapter({
      providerId: 'droid',
      agentFamily: 'droid',
      label: 'Droid',
      status: 'unsupported',
      reason: 'No stable token usage log was found for this provider.',
    }),
    new StaticUsageAdapter({
      providerId: 'auggie',
      agentFamily: 'auggie',
      label: 'Auggie',
      status: 'unsupported',
      reason: 'No stable token usage log was found for this provider.',
    }),
    new StaticUsageAdapter({
      providerId: 'opencode',
      agentFamily: 'opencode',
      label: 'OpenCode',
      status: 'unsupported',
      reason: 'No stable token usage log was found for this provider.',
    }),
    new StaticUsageAdapter({
      providerId: 'custom',
      agentFamily: 'custom',
      label: 'Custom',
      status: 'unsupported',
      reason: 'Custom agents need a provider adapter before token usage can be trusted.',
    }),
  ];
}

export class TokenUsageService {
  constructor(private readonly adapters: TokenUsageAdapter[] = createDefaultAdapters()) {}

  async getProjectUsage(
    request: GetProjectTokenUsageRequest = {}
  ): Promise<ProjectTokenUsageSnapshot> {
    const results = await Promise.all(this.adapters.map((adapter) => adapter.collect()));
    return buildProjectTokenUsageSnapshot(
      results.flatMap((result) => result.sessions),
      results.map((result) => result.status),
      request
    );
  }
}

export const tokenUsageService = new TokenUsageService();
