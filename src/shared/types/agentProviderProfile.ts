import { type AIProvider, isAIProvider } from './ai';

export interface AgentProviderProfile {
  id: string;
  name: string;
  providerId: AIProvider;
  baseUrl: string;
  authToken: string;
  model?: string;
  smallFastModel?: string;
  defaultSonnetModel?: string;
  defaultOpusModel?: string;
  defaultHaikuModel?: string;
  displayOrder?: number;
  enabled?: boolean;
}

export type AgentProviderProfileInput = Omit<AgentProviderProfile, 'providerId'> & {
  providerId?: AIProvider;
};

function normalizeRequiredString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionalString(value: unknown): string | undefined {
  const normalized = normalizeRequiredString(value);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeProviderId(value: unknown): AIProvider {
  return isAIProvider(value) ? value : 'claude-code';
}

export function normalizeAgentProviderProfileInput(input: unknown): AgentProviderProfile | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const candidate = input as Partial<Record<keyof AgentProviderProfile, unknown>>;
  const id = normalizeRequiredString(candidate.id);
  const name = normalizeRequiredString(candidate.name);
  const baseUrl = normalizeRequiredString(candidate.baseUrl);
  const authToken = normalizeRequiredString(candidate.authToken);

  if (!id || !name || !baseUrl || !authToken) {
    return null;
  }

  return {
    id,
    name,
    providerId: normalizeProviderId(candidate.providerId),
    baseUrl,
    authToken,
    model: normalizeOptionalString(candidate.model),
    smallFastModel: normalizeOptionalString(candidate.smallFastModel),
    defaultSonnetModel: normalizeOptionalString(candidate.defaultSonnetModel),
    defaultOpusModel: normalizeOptionalString(candidate.defaultOpusModel),
    defaultHaikuModel: normalizeOptionalString(candidate.defaultHaikuModel),
    displayOrder: normalizeOptionalNumber(candidate.displayOrder),
    enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : undefined,
  };
}

export function normalizeAgentProviderProfileList(input: unknown): AgentProviderProfile[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((entry) => normalizeAgentProviderProfileInput(entry))
    .filter((entry): entry is AgentProviderProfile => entry !== null);
}
