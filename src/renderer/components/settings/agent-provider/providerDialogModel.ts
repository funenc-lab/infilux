export interface ProviderProfileDraftValidationInput {
  adapterSupportsProfiles: boolean;
  authToken: string;
  baseUrl: string;
  name: string;
  source: 'current' | 'manual';
}

export function canSaveProviderProfileDraft({
  adapterSupportsProfiles,
  authToken,
  baseUrl,
  name,
  source,
}: ProviderProfileDraftValidationInput): boolean {
  const hasRequiredFields = Boolean(name.trim() && baseUrl.trim() && authToken.trim());
  if (!hasRequiredFields) {
    return false;
  }

  return source === 'manual' || adapterSupportsProfiles;
}
