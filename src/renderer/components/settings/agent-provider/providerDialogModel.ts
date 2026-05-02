import type { AgentProviderProfile, AIProvider } from '@shared/types';

export interface ProviderProfileDraftValidationInput {
  adapterSupportsProfiles: boolean;
  authToken: string;
  baseUrl: string;
  name: string;
}

export interface ProviderProfileDraftBuildInput {
  authToken: string;
  baseUrl: string;
  defaultHaikuModel: string;
  defaultOpusModel: string;
  defaultSonnetModel: string;
  existingProfile?: Pick<AgentProviderProfile, 'displayOrder' | 'enabled' | 'id'> | null;
  generateId: () => string;
  model: string;
  name: string;
  providerId: AIProvider;
  smallFastModel: string;
}

export function canSaveProviderProfileDraft({
  adapterSupportsProfiles,
  authToken,
  baseUrl,
  name,
}: ProviderProfileDraftValidationInput): boolean {
  const hasRequiredFields = Boolean(name.trim() && baseUrl.trim() && authToken.trim());
  if (!hasRequiredFields) {
    return false;
  }

  return adapterSupportsProfiles;
}

function optionalText(value: string): string | undefined {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function buildProviderProfileFromDraft({
  authToken,
  baseUrl,
  defaultHaikuModel,
  defaultOpusModel,
  defaultSonnetModel,
  existingProfile,
  generateId,
  model,
  name,
  providerId,
  smallFastModel,
}: ProviderProfileDraftBuildInput): AgentProviderProfile {
  const profile: AgentProviderProfile = {
    authToken: authToken.trim(),
    baseUrl: baseUrl.trim(),
    id: existingProfile?.id ?? generateId(),
    name: name.trim(),
    providerId,
    model: optionalText(model),
  };

  if (existingProfile?.displayOrder !== undefined) {
    profile.displayOrder = existingProfile.displayOrder;
  }

  if (existingProfile?.enabled !== undefined) {
    profile.enabled = existingProfile.enabled;
  }

  if (providerId === 'claude-code') {
    profile.smallFastModel = optionalText(smallFastModel);
    profile.defaultSonnetModel = optionalText(defaultSonnetModel);
    profile.defaultOpusModel = optionalText(defaultOpusModel);
    profile.defaultHaikuModel = optionalText(defaultHaikuModel);
  }

  return profile;
}
