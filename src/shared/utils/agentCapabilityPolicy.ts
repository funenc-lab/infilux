import type { AgentCapabilityProvider, ClaudePolicyMaterializationMode } from '@shared/types';
import { getAgentInputBaseId } from './agentInputMode';

const KNOWN_CAPABILITY_PROVIDERS = new Set<AgentCapabilityProvider>(['claude', 'codex', 'gemini']);

function normalizeProviderCandidate(value: string | undefined): AgentCapabilityProvider | null {
  const candidate = value?.trim();
  if (!candidate) {
    return null;
  }

  const baseId = getAgentInputBaseId(candidate);
  return KNOWN_CAPABILITY_PROVIDERS.has(baseId as AgentCapabilityProvider)
    ? (baseId as AgentCapabilityProvider)
    : null;
}

function extractCommandExecutableName(agentCommand: string | undefined): string | undefined {
  const firstToken = agentCommand?.trim().split(/\s+/)[0];
  if (!firstToken) {
    return undefined;
  }

  const normalizedToken = firstToken.replace(/^['"]|['"]$/g, '').replace(/\\/g, '/');
  const executableName = normalizedToken.slice(normalizedToken.lastIndexOf('/') + 1);
  return executableName.replace(/\.exe$/i, '');
}

function resolveAgentCapabilityPolicyBaseId(
  agentId: string | undefined,
  agentCommand: string | undefined
): string | null {
  const candidate =
    normalizeProviderCandidate(agentId) ?? extractCommandExecutableName(agentCommand);
  return candidate ? getAgentInputBaseId(candidate) : null;
}

export function resolveAgentCapabilityPolicyProvider(
  agentId: string | undefined,
  agentCommand: string | undefined
): AgentCapabilityProvider | null {
  const baseId = resolveAgentCapabilityPolicyBaseId(agentId, agentCommand);
  if (baseId === 'claude' || baseId === 'codex' || baseId === 'gemini') {
    return baseId;
  }
  return null;
}

export function supportsAgentCapabilityPolicyLaunch(
  agentId: string | undefined,
  agentCommand: string | undefined
): boolean {
  return resolveAgentCapabilityPolicyProvider(agentId, agentCommand) !== null;
}

export function resolveAgentCapabilityPolicyMaterializationMode(
  agentId: string | undefined,
  agentCommand: string | undefined
): ClaudePolicyMaterializationMode {
  return resolveAgentCapabilityPolicyProvider(agentId, agentCommand) === 'claude'
    ? 'copy'
    : 'provider-native';
}

export function supportsClaudeCapabilityPolicyLaunch(
  agentId: string | undefined,
  agentCommand: string | undefined
): boolean {
  return resolveAgentCapabilityPolicyProvider(agentId, agentCommand) === 'claude';
}

export function resolveClaudeCapabilityPolicyMaterializationMode(
  agentId: string | undefined,
  agentCommand: string | undefined
): ClaudePolicyMaterializationMode {
  return resolveAgentCapabilityPolicyMaterializationMode(agentId, agentCommand);
}
