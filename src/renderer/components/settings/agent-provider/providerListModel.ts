import type { AgentProviderProfile, AIProvider } from '@shared/types';

export interface AgentProviderProfileCapability {
  providerId: AIProvider;
  supportsProfiles: boolean;
}

export interface AgentProviderProfileListSummary {
  savedCount: number;
  switchableCount: number;
  waitingForAdapterCount: number;
}

export function buildAgentProviderProfileListSummary(
  profiles: readonly AgentProviderProfile[],
  capabilities: readonly AgentProviderProfileCapability[]
): AgentProviderProfileListSummary {
  const capabilitiesByProviderId = new Map(
    capabilities.map((capability) => [capability.providerId, capability])
  );

  let switchableCount = 0;
  let waitingForAdapterCount = 0;

  for (const profile of profiles) {
    if (capabilitiesByProviderId.get(profile.providerId)?.supportsProfiles) {
      switchableCount += 1;
    } else {
      waitingForAdapterCount += 1;
    }
  }

  return {
    savedCount: profiles.length,
    switchableCount,
    waitingForAdapterCount,
  };
}
