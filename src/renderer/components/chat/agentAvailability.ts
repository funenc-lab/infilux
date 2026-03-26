import type { CustomAgent } from '@shared/types';

interface AgentConfigLike {
  enabled?: boolean;
  isDefault?: boolean;
  customPath?: string;
}

interface AgentDetectionLike {
  installed: boolean;
}

type AgentEnvironment = 'native' | 'hapi' | 'happy';

interface RemoteProbeResult {
  installed: boolean;
  version?: string;
}

interface RemoteAgentProbeDependencies {
  detectCli: (
    agentId: string,
    customAgent?: CustomAgent,
    customPath?: string
  ) => Promise<RemoteProbeResult>;
  checkHapi: () => Promise<RemoteProbeResult>;
  checkHappy: () => Promise<RemoteProbeResult>;
}

interface RemoteAgentProbeRequest {
  agentId: string;
  agentSettings: Record<string, AgentConfigLike>;
  customAgents: CustomAgent[];
  hapiEnabled: boolean;
  happyEnabled: boolean;
}

export interface RemoteAgentAvailabilityResult {
  available: boolean;
  environment: AgentEnvironment;
  baseId: string;
  reason?: 'agent-missing' | 'hapi-disabled' | 'hapi-missing' | 'happy-disabled' | 'happy-missing';
}

export function getAgentBaseId(agentId: string): string {
  if (agentId.endsWith('-hapi')) {
    return agentId.slice(0, -'-hapi'.length);
  }

  if (agentId.endsWith('-happy')) {
    return agentId.slice(0, -'-happy'.length);
  }

  return agentId;
}

export function getAgentEnvironment(agentId: string): AgentEnvironment {
  if (agentId.endsWith('-hapi')) {
    return 'hapi';
  }

  if (agentId.endsWith('-happy')) {
    return 'happy';
  }

  return 'native';
}

export function resolvePersistedInstalledAgents({
  agentSettings,
  agentDetectionStatus,
  hapiEnabled,
  happyEnabled,
  trustDefaultAgent,
}: {
  agentSettings: Record<string, AgentConfigLike>;
  agentDetectionStatus: Record<string, AgentDetectionLike | undefined>;
  hapiEnabled: boolean;
  happyEnabled: boolean;
  trustDefaultAgent: boolean;
}): Set<string> {
  const enabledAgentIds = Object.keys(agentSettings).filter((id) => agentSettings[id]?.enabled);
  const installedAgents = new Set<string>();

  for (const agentId of enabledAgentIds) {
    if (trustDefaultAgent && agentSettings[agentId]?.isDefault) {
      installedAgents.add(agentId);
      continue;
    }

    const environment = getAgentEnvironment(agentId);
    const baseId = getAgentBaseId(agentId);

    if (environment === 'hapi') {
      if (!hapiEnabled) {
        continue;
      }
      if (agentDetectionStatus[baseId]?.installed) {
        installedAgents.add(agentId);
      }
      continue;
    }

    if (environment === 'happy') {
      if (!happyEnabled) {
        continue;
      }
      if (agentDetectionStatus[baseId]?.installed) {
        installedAgents.add(agentId);
      }
      continue;
    }

    if (agentDetectionStatus[agentId]?.installed) {
      installedAgents.add(agentId);
    }
  }

  return installedAgents;
}

export async function probeRemoteAgentAvailability(
  request: RemoteAgentProbeRequest,
  deps: RemoteAgentProbeDependencies
): Promise<RemoteAgentAvailabilityResult> {
  const environment = getAgentEnvironment(request.agentId);
  const baseId = getAgentBaseId(request.agentId);

  if (environment === 'hapi') {
    if (!request.hapiEnabled) {
      return {
        available: false,
        environment,
        baseId,
        reason: 'hapi-disabled',
      };
    }

    const hapiStatus = await deps.checkHapi();
    if (!hapiStatus.installed) {
      return {
        available: false,
        environment,
        baseId,
        reason: 'hapi-missing',
      };
    }
  }

  if (environment === 'happy') {
    if (!request.happyEnabled) {
      return {
        available: false,
        environment,
        baseId,
        reason: 'happy-disabled',
      };
    }

    const happyStatus = await deps.checkHappy();
    if (!happyStatus.installed) {
      return {
        available: false,
        environment,
        baseId,
        reason: 'happy-missing',
      };
    }
  }

  const customAgent = request.customAgents.find((agent) => agent.id === baseId);
  const customPath = request.agentSettings[baseId]?.customPath;
  const cliStatus = await deps.detectCli(baseId, customAgent, customPath);
  if (!cliStatus.installed) {
    return {
      available: false,
      environment,
      baseId,
      reason: 'agent-missing',
    };
  }

  return {
    available: true,
    environment,
    baseId,
  };
}

export async function resolveRemoteInstalledAgents(
  request: Omit<RemoteAgentProbeRequest, 'agentId'> & { enabledAgentIds: string[] },
  deps: RemoteAgentProbeDependencies
): Promise<Set<string>> {
  const installedAgents = new Set<string>();
  const cliCache = new Map<string, Promise<RemoteProbeResult>>();
  let hapiStatusPromise: Promise<RemoteProbeResult> | null = null;
  let happyStatusPromise: Promise<RemoteProbeResult> | null = null;

  const cachedDeps: RemoteAgentProbeDependencies = {
    detectCli: (agentId, customAgent, customPath) => {
      const cacheKey = `${agentId}::${customPath ?? ''}`;
      const cached = cliCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const next = deps.detectCli(agentId, customAgent, customPath);
      cliCache.set(cacheKey, next);
      return next;
    },
    checkHapi: () => {
      if (!hapiStatusPromise) {
        hapiStatusPromise = deps.checkHapi();
      }
      return hapiStatusPromise;
    },
    checkHappy: () => {
      if (!happyStatusPromise) {
        happyStatusPromise = deps.checkHappy();
      }
      return happyStatusPromise;
    },
  };

  for (const agentId of request.enabledAgentIds) {
    const availability = await probeRemoteAgentAvailability(
      {
        agentId,
        agentSettings: request.agentSettings,
        customAgents: request.customAgents,
        hapiEnabled: request.hapiEnabled,
        happyEnabled: request.happyEnabled,
      },
      cachedDeps
    );

    if (availability.available) {
      installedAgents.add(agentId);
    }
  }

  return installedAgents;
}
