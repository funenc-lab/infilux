import { AI_PROVIDER_CATALOG, type AIProvider } from '@shared/types';

export type AgentIntegrationCapabilityId =
  | 'editor-context'
  | 'completion-notification'
  | 'question-notification'
  | 'status-telemetry';

export interface AgentIntegrationCapability {
  id: AgentIntegrationCapabilityId;
  titleKey: string;
  descriptionKey: string;
  supportedProviderLabels: string[];
  unsupportedProviderLabels: string[];
}

export interface AgentIntegrationCapabilityModel {
  supportedProviderLabels: string[];
  unsupportedProviderLabels: string[];
  capabilities: AgentIntegrationCapability[];
}

interface CapabilityDefinition {
  id: AgentIntegrationCapabilityId;
  titleKey: string;
  descriptionKey: string;
  supportedProviders: readonly AIProvider[];
}

const CAPABILITY_DEFINITIONS: readonly CapabilityDefinition[] = [
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
    supportedProviders: ['claude-code'],
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

const ALL_PROVIDER_IDS = Object.keys(AI_PROVIDER_CATALOG) as AIProvider[];

function resolveProviderLabels(providerIds: readonly AIProvider[]): string[] {
  return providerIds.map((providerId) => AI_PROVIDER_CATALOG[providerId].label);
}

function resolveUnsupportedProviders(supportedProviders: readonly AIProvider[]): AIProvider[] {
  const supportedProviderSet = new Set<AIProvider>(supportedProviders);
  return ALL_PROVIDER_IDS.filter((providerId) => !supportedProviderSet.has(providerId));
}

export function resolveAgentIntegrationCapabilityModel(): AgentIntegrationCapabilityModel {
  const supportedProviderIds = new Set<AIProvider>();

  const capabilities = CAPABILITY_DEFINITIONS.map((definition) => {
    for (const providerId of definition.supportedProviders) {
      supportedProviderIds.add(providerId);
    }

    const unsupportedProviders = resolveUnsupportedProviders(definition.supportedProviders);
    return {
      id: definition.id,
      titleKey: definition.titleKey,
      descriptionKey: definition.descriptionKey,
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

  return {
    supportedProviderLabels: resolveProviderLabels(supportedProviders),
    unsupportedProviderLabels: resolveProviderLabels(unsupportedProviders),
    capabilities,
  };
}
