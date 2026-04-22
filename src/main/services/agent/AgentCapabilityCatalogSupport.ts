import type {
  AgentCapabilityProvider,
  ClaudeCapabilityCatalog,
  ClaudeCapabilityKind,
} from '@shared/types';

const PROVIDER_SUPPORTED_CAPABILITY_KINDS: Readonly<
  Record<AgentCapabilityProvider, ReadonlySet<ClaudeCapabilityKind>>
> = {
  claude: new Set<ClaudeCapabilityKind>(['command', 'legacy-skill', 'subagent']),
  codex: new Set<ClaudeCapabilityKind>(['legacy-skill']),
  gemini: new Set<ClaudeCapabilityKind>(['legacy-skill']),
};

export function filterAgentCapabilityCatalogForProvider(
  catalog: ClaudeCapabilityCatalog,
  provider: AgentCapabilityProvider
): ClaudeCapabilityCatalog {
  const supportedKinds = PROVIDER_SUPPORTED_CAPABILITY_KINDS[provider];
  const filteredCapabilities = catalog.capabilities.filter((item) => supportedKinds.has(item.kind));

  if (filteredCapabilities.length === catalog.capabilities.length) {
    return catalog;
  }

  return {
    ...catalog,
    capabilities: filteredCapabilities,
  };
}
