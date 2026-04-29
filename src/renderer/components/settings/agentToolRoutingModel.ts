import {
  AI_PROVIDER_CATALOG,
  BUILTIN_AGENT_CATALOG,
  BUILTIN_AGENT_IDS,
  type BuiltinAgentId,
  type CustomAgent,
} from '@shared/types';

type AgentRuntime = 'native' | 'hapi' | 'happy';
type AgentToolRoutingStatus = 'installed' | 'not-installed' | 'not-detected';
type AgentToolCommandSource = 'default-command' | 'custom-path' | 'custom-agent';

interface AgentToolRoutingConfig {
  enabled?: boolean;
  isDefault?: boolean;
  customPath?: string;
}

interface AgentToolRoutingDetection {
  installed: boolean;
}

export interface AgentToolRoutingOption {
  agentId: string;
  baseAgentId: string;
  label: string;
  command: string;
  commandSource: AgentToolCommandSource;
  providerLabel: string;
  runtime: AgentRuntime;
  runtimeLabel: string;
  status: AgentToolRoutingStatus;
  isDefault: boolean;
}

export interface AgentToolRoutingModel {
  defaultAgentId: string;
  defaultOption: AgentToolRoutingOption | null;
  options: AgentToolRoutingOption[];
}

interface ResolveAgentToolRoutingModelRequest {
  agentSettings: Record<string, AgentToolRoutingConfig | undefined>;
  agentDetectionStatus: Record<string, AgentToolRoutingDetection | undefined>;
  customAgents: CustomAgent[];
  hapiEnabled: boolean;
  happyEnabled: boolean;
}

const BUILTIN_AGENT_ID_SET = new Set<string>(BUILTIN_AGENT_IDS);
const RUNTIME_ORDER: Record<AgentRuntime, number> = {
  native: 0,
  hapi: 1,
  happy: 2,
};

function isBuiltinAgentId(value: string): value is BuiltinAgentId {
  return BUILTIN_AGENT_ID_SET.has(value);
}

function getAgentBaseId(agentId: string): string {
  if (agentId.endsWith('-hapi')) {
    return agentId.slice(0, -'-hapi'.length);
  }

  if (agentId.endsWith('-happy')) {
    return agentId.slice(0, -'-happy'.length);
  }

  return agentId;
}

function getAgentRuntime(agentId: string): AgentRuntime {
  if (agentId.endsWith('-hapi')) {
    return 'hapi';
  }

  if (agentId.endsWith('-happy')) {
    return 'happy';
  }

  return 'native';
}

function getRuntimeLabel(runtime: AgentRuntime): string {
  if (runtime === 'hapi') {
    return 'Hapi';
  }
  if (runtime === 'happy') {
    return 'Happy';
  }
  return 'Native';
}

function getStatus(
  agentId: string,
  detectionStatus: Record<string, AgentToolRoutingDetection | undefined>
): AgentToolRoutingStatus {
  const runtime = getAgentRuntime(agentId);
  const detectionId = runtime === 'native' ? agentId : getAgentBaseId(agentId);
  const detection = detectionStatus[detectionId];

  if (!detection) {
    return 'not-detected';
  }

  return detection.installed ? 'installed' : 'not-installed';
}

function buildAgentLabel(agentId: string, baseLabel: string): string {
  const runtime = getAgentRuntime(agentId);
  if (runtime === 'hapi') {
    return `${baseLabel} (Hapi)`;
  }
  if (runtime === 'happy') {
    return `${baseLabel} (Happy)`;
  }
  return baseLabel;
}

function resolveProviderLabel(baseAgentId: string): string {
  if (!isBuiltinAgentId(baseAgentId)) {
    return 'Custom CLI';
  }

  const entry = BUILTIN_AGENT_CATALOG[baseAgentId];
  const provider = 'provider' in entry ? entry.provider : undefined;
  return provider ? AI_PROVIDER_CATALOG[provider].label : 'CLI managed';
}

function resolveCommand(
  agentId: string,
  baseAgentId: string,
  agentSettings: Record<string, AgentToolRoutingConfig | undefined>,
  customAgent: CustomAgent | undefined
): { command: string; commandSource: AgentToolCommandSource } {
  const baseConfig = agentSettings[baseAgentId];
  if (baseConfig?.customPath) {
    return {
      command: baseConfig.customPath,
      commandSource: 'custom-path',
    };
  }

  if (customAgent) {
    return {
      command: customAgent.command,
      commandSource: 'custom-agent',
    };
  }

  if (isBuiltinAgentId(baseAgentId)) {
    return {
      command: BUILTIN_AGENT_CATALOG[baseAgentId].command,
      commandSource: 'default-command',
    };
  }

  return {
    command: agentId,
    commandSource: 'default-command',
  };
}

function resolveOption(
  agentId: string,
  request: ResolveAgentToolRoutingModelRequest
): AgentToolRoutingOption | null {
  const config = request.agentSettings[agentId];
  if (!config?.enabled) {
    return null;
  }

  const runtime = getAgentRuntime(agentId);
  if (runtime === 'hapi' && !request.hapiEnabled) {
    return null;
  }
  if (runtime === 'happy' && !request.happyEnabled) {
    return null;
  }

  const baseAgentId = getAgentBaseId(agentId);
  const customAgent = request.customAgents.find((agent) => agent.id === baseAgentId);
  const builtinEntry = isBuiltinAgentId(baseAgentId)
    ? BUILTIN_AGENT_CATALOG[baseAgentId]
    : undefined;
  const baseLabel = customAgent?.name ?? builtinEntry?.name ?? baseAgentId;
  const command = resolveCommand(agentId, baseAgentId, request.agentSettings, customAgent);

  return {
    agentId,
    baseAgentId,
    label: buildAgentLabel(agentId, baseLabel),
    command: command.command,
    commandSource: command.commandSource,
    providerLabel: resolveProviderLabel(baseAgentId),
    runtime,
    runtimeLabel: getRuntimeLabel(runtime),
    status: getStatus(agentId, request.agentDetectionStatus),
    isDefault: Boolean(config.isDefault),
  };
}

function compareAgentIds(left: string, right: string): number {
  const leftBase = getAgentBaseId(left);
  const rightBase = getAgentBaseId(right);
  const leftBuiltinIndex = BUILTIN_AGENT_IDS.indexOf(leftBase as BuiltinAgentId);
  const rightBuiltinIndex = BUILTIN_AGENT_IDS.indexOf(rightBase as BuiltinAgentId);
  const leftBaseOrder = leftBuiltinIndex === -1 ? Number.MAX_SAFE_INTEGER : leftBuiltinIndex;
  const rightBaseOrder = rightBuiltinIndex === -1 ? Number.MAX_SAFE_INTEGER : rightBuiltinIndex;

  if (leftBaseOrder !== rightBaseOrder) {
    return leftBaseOrder - rightBaseOrder;
  }

  const runtimeOrder = RUNTIME_ORDER[getAgentRuntime(left)] - RUNTIME_ORDER[getAgentRuntime(right)];
  if (runtimeOrder !== 0) {
    return runtimeOrder;
  }

  return left.localeCompare(right);
}

export function resolveAgentToolRoutingModel(
  request: ResolveAgentToolRoutingModelRequest
): AgentToolRoutingModel {
  const options = Object.keys(request.agentSettings)
    .sort(compareAgentIds)
    .map((agentId) => resolveOption(agentId, request))
    .filter((option): option is AgentToolRoutingOption => option !== null);
  const defaultOption = options.find((option) => option.isDefault) ?? options[0] ?? null;

  return {
    defaultAgentId: defaultOption?.agentId ?? '',
    defaultOption,
    options,
  };
}
