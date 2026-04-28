import type { AgentMetadata } from './agent';
import type { BuiltinAgentId } from './cli';

export type AgentFamily =
  | 'claude'
  | 'codex'
  | 'droid'
  | 'gemini'
  | 'auggie'
  | 'cursor'
  | 'opencode'
  | 'custom';

export type AgentCompletionSignal = 'hook-or-marker' | 'marker';

export interface AgentCapabilityProfile {
  agentFamily: AgentFamily;
  canEditCode: boolean;
  canReviewCode: boolean;
  canResearch: boolean;
  canHandleLargeContext: boolean;
  canDeepReason: boolean;
  hasStrongTestAffinity: boolean;
  completionSignal: AgentCompletionSignal;
}

interface AIProviderCatalogModel {
  id: string;
  label: string;
}

interface AIProviderCatalogEntry {
  id: string;
  label: string;
  command: string;
  defaultModel: string;
  models: readonly AIProviderCatalogModel[];
}

export const AI_PROVIDER_CATALOG = {
  'claude-code': {
    id: 'claude-code',
    label: 'Claude Code',
    command: 'claude',
    defaultModel: 'haiku',
    models: [
      { id: 'haiku', label: 'Haiku' },
      { id: 'sonnet', label: 'Sonnet' },
      { id: 'opus', label: 'Opus' },
    ],
  },
  'codex-cli': {
    id: 'codex-cli',
    label: 'Codex CLI',
    command: 'codex',
    defaultModel: 'gpt-5.2',
    models: [
      { id: 'gpt-5.2', label: 'GPT-5.2' },
      { id: 'gpt-5.2-codex', label: 'GPT-5.2 Codex' },
    ],
  },
  'cursor-cli': {
    id: 'cursor-cli',
    label: 'Cursor CLI',
    command: 'agent',
    defaultModel: 'auto',
    models: [
      { id: 'auto', label: 'Auto' },
      { id: 'composer-1', label: 'Composer 1' },
      { id: 'gpt-5.2', label: 'GPT-5.2' },
      { id: 'sonnet-4.5', label: 'Sonnet 4.5' },
      { id: 'opus-4.6', label: 'Opus 4.6' },
    ],
  },
  'gemini-cli': {
    id: 'gemini-cli',
    label: 'Gemini CLI',
    command: 'gemini',
    defaultModel: 'gemini-3-pro-preview',
    models: [
      { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
      { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
    ],
  },
} as const satisfies Record<string, AIProviderCatalogEntry>;

export type AIProviderCatalogId = keyof typeof AI_PROVIDER_CATALOG;
export type AIProviderCatalogModelId =
  (typeof AI_PROVIDER_CATALOG)[AIProviderCatalogId]['models'][number]['id'];

type BuiltinAgentRuntimeCapabilities = AgentMetadata['capabilities'];

interface BuiltinAgentCatalogEntry {
  id: BuiltinAgentId;
  name: string;
  description: string;
  command: string;
  icon: string;
  provider?: AIProviderCatalogId;
  defaultModel?: AIProviderCatalogModelId;
  capabilities: AgentCapabilityProfile;
  runtimeCapabilities: BuiltinAgentRuntimeCapabilities;
}

const FULL_RUNTIME_CAPABILITIES: BuiltinAgentRuntimeCapabilities = {
  chat: true,
  codeEdit: true,
  terminal: true,
  fileRead: true,
  fileWrite: true,
};

const READ_ORIENTED_RUNTIME_CAPABILITIES: BuiltinAgentRuntimeCapabilities = {
  chat: true,
  codeEdit: true,
  terminal: false,
  fileRead: true,
  fileWrite: false,
};

const CUSTOM_AGENT_CAPABILITY_PROFILE: AgentCapabilityProfile = {
  agentFamily: 'custom',
  canEditCode: true,
  canReviewCode: false,
  canResearch: false,
  canHandleLargeContext: false,
  canDeepReason: false,
  hasStrongTestAffinity: false,
  completionSignal: 'marker',
};

export const BUILTIN_AGENT_CATALOG = {
  claude: {
    id: 'claude',
    name: 'Claude',
    description: 'Anthropic Claude Code CLI',
    command: 'claude',
    icon: 'claude',
    provider: 'claude-code',
    defaultModel: AI_PROVIDER_CATALOG['claude-code'].defaultModel,
    capabilities: {
      agentFamily: 'claude',
      canEditCode: true,
      canReviewCode: true,
      canResearch: false,
      canHandleLargeContext: true,
      canDeepReason: true,
      hasStrongTestAffinity: false,
      completionSignal: 'hook-or-marker',
    },
    runtimeCapabilities: FULL_RUNTIME_CAPABILITIES,
  },
  codex: {
    id: 'codex',
    name: 'Codex',
    description: 'OpenAI Codex CLI',
    command: 'codex',
    icon: 'codex',
    provider: 'codex-cli',
    defaultModel: AI_PROVIDER_CATALOG['codex-cli'].defaultModel,
    capabilities: {
      agentFamily: 'codex',
      canEditCode: true,
      canReviewCode: true,
      canResearch: false,
      canHandleLargeContext: true,
      canDeepReason: true,
      hasStrongTestAffinity: true,
      completionSignal: 'marker',
    },
    runtimeCapabilities: FULL_RUNTIME_CAPABILITIES,
  },
  droid: {
    id: 'droid',
    name: 'Droid',
    description: 'Droid AI CLI',
    command: 'droid',
    icon: 'droid',
    capabilities: {
      agentFamily: 'droid',
      canEditCode: true,
      canReviewCode: false,
      canResearch: false,
      canHandleLargeContext: false,
      canDeepReason: false,
      hasStrongTestAffinity: false,
      completionSignal: 'marker',
    },
    runtimeCapabilities: FULL_RUNTIME_CAPABILITIES,
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    description: 'Google Gemini CLI',
    command: 'gemini',
    icon: 'gemini',
    provider: 'gemini-cli',
    defaultModel: AI_PROVIDER_CATALOG['gemini-cli'].defaultModel,
    capabilities: {
      agentFamily: 'gemini',
      canEditCode: true,
      canReviewCode: false,
      canResearch: true,
      canHandleLargeContext: true,
      canDeepReason: true,
      hasStrongTestAffinity: false,
      completionSignal: 'marker',
    },
    runtimeCapabilities: READ_ORIENTED_RUNTIME_CAPABILITIES,
  },
  auggie: {
    id: 'auggie',
    name: 'Auggie',
    description: 'Augment Code CLI',
    command: 'auggie',
    icon: 'auggie',
    capabilities: {
      agentFamily: 'auggie',
      canEditCode: true,
      canReviewCode: true,
      canResearch: false,
      canHandleLargeContext: true,
      canDeepReason: false,
      hasStrongTestAffinity: false,
      completionSignal: 'marker',
    },
    runtimeCapabilities: FULL_RUNTIME_CAPABILITIES,
  },
  cursor: {
    id: 'cursor',
    name: 'Cursor',
    description: 'Cursor Agent CLI',
    command: 'cursor-agent',
    icon: 'cursor',
    provider: 'cursor-cli',
    defaultModel: AI_PROVIDER_CATALOG['cursor-cli'].defaultModel,
    capabilities: {
      agentFamily: 'cursor',
      canEditCode: true,
      canReviewCode: true,
      canResearch: false,
      canHandleLargeContext: true,
      canDeepReason: false,
      hasStrongTestAffinity: false,
      completionSignal: 'marker',
    },
    runtimeCapabilities: FULL_RUNTIME_CAPABILITIES,
  },
  opencode: {
    id: 'opencode',
    name: 'OpenCode',
    description: 'OpenCode AI CLI',
    command: 'opencode',
    icon: 'opencode',
    capabilities: {
      agentFamily: 'opencode',
      canEditCode: true,
      canReviewCode: true,
      canResearch: false,
      canHandleLargeContext: true,
      canDeepReason: false,
      hasStrongTestAffinity: true,
      completionSignal: 'marker',
    },
    runtimeCapabilities: FULL_RUNTIME_CAPABILITIES,
  },
} as const satisfies Record<BuiltinAgentId, BuiltinAgentCatalogEntry>;

export const BUILTIN_AGENT_IDS = Object.keys(BUILTIN_AGENT_CATALOG) as BuiltinAgentId[];

function stripAgentEnvironmentSuffix(agentId: string): string {
  if (agentId.endsWith('-hapi')) {
    return agentId.slice(0, -5);
  }
  if (agentId.endsWith('-happy')) {
    return agentId.slice(0, -6);
  }
  return agentId;
}

function extractCommandExecutableName(command: string | undefined): string | undefined {
  const firstToken = command?.trim().split(/\s+/)[0];
  if (!firstToken) {
    return undefined;
  }

  const normalizedToken = firstToken.replace(/^['"]|['"]$/g, '').replace(/\\/g, '/');
  const executableName = normalizedToken.slice(normalizedToken.lastIndexOf('/') + 1);
  return executableName.replace(/\.exe$/i, '');
}

function findBuiltinAgentByCommand(
  command: string | undefined
): BuiltinAgentCatalogEntry | undefined {
  const executableName = extractCommandExecutableName(command);
  if (!executableName) {
    return undefined;
  }

  return BUILTIN_AGENT_IDS.map((id) => BUILTIN_AGENT_CATALOG[id]).find(
    (entry) => entry.command === executableName
  );
}

export function getAIProviderDefaultModel(provider: AIProviderCatalogId): AIProviderCatalogModelId {
  return AI_PROVIDER_CATALOG[provider].defaultModel;
}

export function getBuiltinAgentCatalogEntry(
  agentId: string | undefined
): BuiltinAgentCatalogEntry | undefined {
  if (!agentId) {
    return undefined;
  }

  const baseId = stripAgentEnvironmentSuffix(agentId);
  return BUILTIN_AGENT_CATALOG[baseId as BuiltinAgentId];
}

export function resolveBuiltinAgentCatalogEntry(
  agentId: string | undefined,
  command: string | undefined
): BuiltinAgentCatalogEntry | undefined {
  return getBuiltinAgentCatalogEntry(agentId) ?? findBuiltinAgentByCommand(command);
}

export function resolveAgentCapabilityProfile(
  agentId: string | undefined,
  command: string | undefined
): AgentCapabilityProfile {
  return (
    resolveBuiltinAgentCatalogEntry(agentId, command)?.capabilities ??
    CUSTOM_AGENT_CAPABILITY_PROFILE
  );
}

export function getBuiltinAgentMetadata(): AgentMetadata[] {
  return BUILTIN_AGENT_IDS.map((id) => {
    const entry: BuiltinAgentCatalogEntry = BUILTIN_AGENT_CATALOG[id];
    return {
      id: entry.id,
      name: entry.name,
      description: entry.description,
      icon: entry.icon,
      binary: entry.command,
      defaultModel: entry.defaultModel,
      capabilities: entry.runtimeCapabilities,
    };
  });
}
