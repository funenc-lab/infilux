import { getBuiltinAgentCatalogEntry } from '@shared/types';

export interface ResolvedAgent {
  agentId: string;
  name: string;
  command: string;
  isDefault: boolean;
  environment: 'native' | 'hapi' | 'happy';
  customPath?: string;
  customArgs?: string;
}

/** Resolve an agentId into display name, command, environment, and custom settings. */
export function resolveAgent(
  agentId: string,
  agentSettings: Record<
    string,
    { enabled?: boolean; isDefault?: boolean; customPath?: string; customArgs?: string }
  >,
  customAgents: { id: string; name: string; command: string }[]
): ResolvedAgent {
  const isHapi = agentId.endsWith('-hapi');
  const isHappy = agentId.endsWith('-happy');
  const baseId = isHapi ? agentId.slice(0, -5) : isHappy ? agentId.slice(0, -6) : agentId;

  const customAgent = customAgents.find((agent) => agent.id === baseId);
  const builtinAgent = getBuiltinAgentCatalogEntry(baseId);
  const baseName = customAgent?.name ?? builtinAgent?.name ?? baseId;
  const command = customAgent?.command ?? builtinAgent?.command ?? baseId;
  const name = isHapi ? `${baseName} (Hapi)` : isHappy ? `${baseName} (Happy)` : baseName;
  const environment = isHapi ? 'hapi' : isHappy ? 'happy' : 'native';
  const isDefault = !!agentSettings[agentId]?.isDefault;
  const config = agentSettings[baseId];

  return {
    agentId,
    name,
    command,
    isDefault,
    environment,
    customPath: config?.customPath,
    customArgs: config?.customArgs,
  };
}
