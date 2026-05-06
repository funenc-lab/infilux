import { AI_PROVIDER_CATALOG, type AIProvider } from '@shared/types';

export type AgentIntegrationCapabilityId =
  | 'provider-switching'
  | 'editor-context'
  | 'completion-notification'
  | 'question-notification'
  | 'status-telemetry';

export interface AgentIntegrationCapability {
  id: AgentIntegrationCapabilityId;
  titleKey: string;
  descriptionKey: string;
  providerStatuses: AgentIntegrationCapabilityProviderStatus[];
  supportedProviderCount: number;
  supportedProviderLabels: string[];
  unsupportedProviderLabels: string[];
}

export interface AgentIntegrationCapabilityProvider {
  providerId: AIProvider;
  label: string;
}

export interface AgentIntegrationCapabilityProviderStatus
  extends AgentIntegrationCapabilityProvider {
  supported: boolean;
}

export type AgentIntegrationCapabilityCoverageTone = 'complete' | 'partial' | 'pending';

export interface AgentIntegrationCapabilityProviderCoverage
  extends AgentIntegrationCapabilityProvider {
  supportedCapabilityCount: number;
  unsupportedCapabilityCount: number;
  totalCapabilityCount: number;
  coveragePercent: number;
  tone: AgentIntegrationCapabilityCoverageTone;
  supportedCapabilityIds: AgentIntegrationCapabilityId[];
  unsupportedCapabilityIds: AgentIntegrationCapabilityId[];
}

export interface AgentIntegrationCapabilityModel {
  providers: AgentIntegrationCapabilityProvider[];
  totalCapabilityCount: number;
  supportedProviderLabels: string[];
  unsupportedProviderLabels: string[];
  fullCoverageProviderLabels: string[];
  partialCoverageProviderLabels: string[];
  noCoverageProviderLabels: string[];
  providerCoverages: AgentIntegrationCapabilityProviderCoverage[];
  capabilities: AgentIntegrationCapability[];
}

interface CapabilityDefinition {
  id: AgentIntegrationCapabilityId;
  titleKey: string;
  descriptionKey: string;
  supportedProviders: readonly AIProvider[];
}

const ALL_PROVIDER_IDS = Object.keys(AI_PROVIDER_CATALOG) as AIProvider[];

const CAPABILITY_DEFINITIONS: readonly CapabilityDefinition[] = [
  {
    id: 'provider-switching',
    titleKey: 'Provider profile switching',
    descriptionKey:
      'Save and switch supported Agent CLI provider profiles from settings and SessionBar.',
    supportedProviders: ['claude-code', 'codex-cli', 'gemini-cli'],
  },
  {
    id: 'editor-context',
    titleKey: 'Editor context bridge',
    descriptionKey: 'Send editor selection and @mention context to supported agent IDE bridges.',
    supportedProviders: ['claude-code'],
  },
  {
    id: 'completion-notification',
    titleKey: 'Completion notifications',
    descriptionKey:
      'Use provider lifecycle hooks when available, then fall back to terminal completion markers.',
    supportedProviders: ALL_PROVIDER_IDS,
  },
  {
    id: 'question-notification',
    titleKey: 'Question notifications',
    descriptionKey: 'Notify when a supported agent requests user input or permission.',
    supportedProviders: ['claude-code'],
  },
  {
    id: 'status-telemetry',
    titleKey: 'Status telemetry',
    descriptionKey:
      'Show supported agent telemetry such as model, context, and cost at the bottom of the terminal.',
    supportedProviders: ['claude-code'],
  },
];

function resolveProviderLabels(providerIds: readonly AIProvider[]): string[] {
  return providerIds.map((providerId) => AI_PROVIDER_CATALOG[providerId].label);
}

function resolveProviders(
  providerIds: readonly AIProvider[]
): AgentIntegrationCapabilityProvider[] {
  return providerIds.map((providerId) => ({
    providerId,
    label: AI_PROVIDER_CATALOG[providerId].label,
  }));
}

function resolveUnsupportedProviders(supportedProviders: readonly AIProvider[]): AIProvider[] {
  const supportedProviderSet = new Set<AIProvider>(supportedProviders);
  return ALL_PROVIDER_IDS.filter((providerId) => !supportedProviderSet.has(providerId));
}

function resolveCoverageTone(
  supportedCapabilityCount: number,
  totalCapabilityCount: number
): AgentIntegrationCapabilityCoverageTone {
  if (supportedCapabilityCount === totalCapabilityCount) {
    return 'complete';
  }

  return supportedCapabilityCount > 0 ? 'partial' : 'pending';
}

function resolveProviderCoverages(
  providers: readonly AgentIntegrationCapabilityProvider[],
  capabilityDefinitions: readonly CapabilityDefinition[]
): AgentIntegrationCapabilityProviderCoverage[] {
  const totalCapabilityCount = capabilityDefinitions.length;

  return providers.map((provider) => {
    const supportedCapabilityIds = capabilityDefinitions
      .filter((definition) => definition.supportedProviders.includes(provider.providerId))
      .map((definition) => definition.id);
    const unsupportedCapabilityIds = capabilityDefinitions
      .filter((definition) => !definition.supportedProviders.includes(provider.providerId))
      .map((definition) => definition.id);
    const supportedCapabilityCount = supportedCapabilityIds.length;
    const unsupportedCapabilityCount = unsupportedCapabilityIds.length;

    return {
      ...provider,
      supportedCapabilityCount,
      unsupportedCapabilityCount,
      totalCapabilityCount,
      coveragePercent: Math.round((supportedCapabilityCount / totalCapabilityCount) * 100),
      tone: resolveCoverageTone(supportedCapabilityCount, totalCapabilityCount),
      supportedCapabilityIds,
      unsupportedCapabilityIds,
    };
  });
}

function filterProviderLabelsByTone(
  providerCoverages: readonly AgentIntegrationCapabilityProviderCoverage[],
  tone: AgentIntegrationCapabilityCoverageTone
): string[] {
  return providerCoverages
    .filter((coverage) => coverage.tone === tone)
    .map((coverage) => coverage.label);
}

export function resolveAgentIntegrationCapabilityModel(): AgentIntegrationCapabilityModel {
  const supportedProviderIds = new Set<AIProvider>();
  const providers = resolveProviders(ALL_PROVIDER_IDS);
  const totalCapabilityCount = CAPABILITY_DEFINITIONS.length;

  const capabilities = CAPABILITY_DEFINITIONS.map((definition) => {
    const supportedCapabilityProviders = new Set<AIProvider>(definition.supportedProviders);
    for (const providerId of definition.supportedProviders) {
      supportedProviderIds.add(providerId);
    }

    const unsupportedProviders = resolveUnsupportedProviders(definition.supportedProviders);
    return {
      id: definition.id,
      titleKey: definition.titleKey,
      descriptionKey: definition.descriptionKey,
      providerStatuses: providers.map((provider) => ({
        ...provider,
        supported: supportedCapabilityProviders.has(provider.providerId),
      })),
      supportedProviderCount: definition.supportedProviders.length,
      supportedProviderLabels: resolveProviderLabels(definition.supportedProviders),
      unsupportedProviderLabels: resolveProviderLabels(unsupportedProviders),
    };
  });

  const supportedProviders = ALL_PROVIDER_IDS.filter((providerId) =>
    supportedProviderIds.has(providerId)
  );
  const unsupportedProviders = ALL_PROVIDER_IDS.filter(
    (providerId) => !supportedProviderIds.has(providerId)
  );
  const providerCoverages = resolveProviderCoverages(providers, CAPABILITY_DEFINITIONS);

  return {
    providers,
    totalCapabilityCount,
    supportedProviderLabels: resolveProviderLabels(supportedProviders),
    unsupportedProviderLabels: resolveProviderLabels(unsupportedProviders),
    fullCoverageProviderLabels: filterProviderLabelsByTone(providerCoverages, 'complete'),
    partialCoverageProviderLabels: filterProviderLabelsByTone(providerCoverages, 'partial'),
    noCoverageProviderLabels: filterProviderLabelsByTone(providerCoverages, 'pending'),
    providerCoverages,
    capabilities,
  };
}

export function findAgentIntegrationCapability(
  model: AgentIntegrationCapabilityModel,
  capabilityId: AgentIntegrationCapabilityId
): AgentIntegrationCapability | null {
  return model.capabilities.find((capability) => capability.id === capabilityId) ?? null;
}
