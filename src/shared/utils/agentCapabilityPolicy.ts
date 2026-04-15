import type { AgentCapabilityProvider, ClaudePolicyMaterializationMode } from '@shared/types';
import { getAgentInputBaseId } from './agentInputMode';

function resolveAgentCapabilityPolicyBaseId(
  agentId: string | undefined,
  agentCommand: string | undefined
): string | null {
  const candidate = agentId?.trim() || agentCommand?.trim();
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
