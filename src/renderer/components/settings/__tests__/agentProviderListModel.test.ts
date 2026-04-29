import type { AgentProviderProfile } from '@shared/types';
import { describe, expect, it } from 'vitest';
import { buildAgentProviderProfileListSummary } from '../agent-provider/providerListModel';

const profiles: AgentProviderProfile[] = [
  {
    id: 'claude-provider',
    name: 'Claude',
    providerId: 'claude-code',
    baseUrl: 'https://api.anthropic.com',
    authToken: 'token',
  },
  {
    id: 'codex-provider',
    name: 'Codex',
    providerId: 'codex-cli',
    baseUrl: 'https://api.openai.com/v1',
    authToken: 'token',
  },
];

describe('agent provider list model', () => {
  it('summarizes saved, switchable, and adapter-pending provider profiles', () => {
    expect(
      buildAgentProviderProfileListSummary(profiles, [
        { providerId: 'claude-code', supportsProfiles: true },
        { providerId: 'codex-cli', supportsProfiles: false },
      ])
    ).toEqual({
      savedCount: 2,
      switchableCount: 1,
      waitingForAdapterCount: 1,
    });
  });

  it('treats unknown provider capabilities as waiting for an adapter', () => {
    expect(buildAgentProviderProfileListSummary(profiles, [])).toEqual({
      savedCount: 2,
      switchableCount: 0,
      waitingForAdapterCount: 2,
    });
  });
});
