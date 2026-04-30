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

export type AgentProviderDetectionAction = 'none' | 'preview' | 'save' | 'saved';

export interface AgentProviderDetectionStateInput {
  activeProfileName?: string | null;
  hasAuthToken: boolean;
  hasDetectedConfig: boolean;
  supportsProfiles: boolean;
}

export interface AgentProviderDetectionState {
  action: AgentProviderDetectionAction;
  statusKey: string;
  statusValues?: Record<string, string>;
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

export function buildAgentProviderDetectionState({
  activeProfileName,
  hasAuthToken,
  hasDetectedConfig,
  supportsProfiles,
}: AgentProviderDetectionStateInput): AgentProviderDetectionState {
  if (!hasDetectedConfig) {
    return {
      action: 'none',
      statusKey: 'No config detected',
    };
  }

  if (!supportsProfiles) {
    return {
      action: 'preview',
      statusKey: 'Provider profile switching is not available for this AI tool yet.',
    };
  }

  if (!hasAuthToken) {
    return {
      action: 'preview',
      statusKey: 'Detected CLI config is missing required provider credentials.',
    };
  }

  if (activeProfileName) {
    return {
      action: 'saved',
      statusKey: 'Provider profile already saved as {{name}}',
      statusValues: { name: activeProfileName },
    };
  }

  return {
    action: 'save',
    statusKey: 'Current config not saved',
  };
}
