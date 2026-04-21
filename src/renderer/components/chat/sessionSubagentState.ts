import type { LiveAgentSubagent } from '@shared/types';

export type SessionSubagentProvider = 'codex';

export type SessionSubagentPendingReason = 'session-not-ready' | 'provider-session-pending';

export type SessionSubagentUnsupportedReason =
  | 'provider-not-supported'
  | 'remote-provider-not-supported';

export type SessionSubagentViewState =
  | {
      kind: 'supported';
      provider: SessionSubagentProvider;
    }
  | {
      kind: 'pending';
      provider: SessionSubagentProvider;
      reason: SessionSubagentPendingReason;
    }
  | {
      kind: 'unsupported';
      reason: SessionSubagentUnsupportedReason;
    };

interface ResolveSessionSubagentViewStateOptions {
  agentId?: string;
  agentCommand?: string;
  initialized?: boolean;
  uiSessionId?: string;
  providerSessionId?: string;
  isRemoteExecution?: boolean;
}

function normalizeAgentBaseId(agentIdOrCommand?: string): string {
  return (agentIdOrCommand ?? '')
    .replace(/-(hapi|happy)$/, '')
    .trim()
    .toLowerCase();
}

export function resolveSessionSubagentProvider(
  agentId?: string,
  agentCommand?: string
): SessionSubagentProvider | null {
  const baseId = normalizeAgentBaseId(agentId);
  if (baseId === 'codex') {
    return 'codex';
  }

  return normalizeAgentBaseId(agentCommand) === 'codex' ? 'codex' : null;
}

function hasResolvedProviderSessionId(uiSessionId?: string, providerSessionId?: string): boolean {
  if (!providerSessionId) {
    return false;
  }

  if (!uiSessionId) {
    return true;
  }

  return providerSessionId !== uiSessionId;
}

export function resolveSessionSubagentViewState({
  agentId,
  agentCommand,
  initialized = false,
  uiSessionId,
  providerSessionId,
  isRemoteExecution = false,
}: ResolveSessionSubagentViewStateOptions): SessionSubagentViewState {
  const provider = resolveSessionSubagentProvider(agentId, agentCommand);
  if (!provider) {
    return {
      kind: 'unsupported',
      reason: 'provider-not-supported',
    };
  }

  if (isRemoteExecution) {
    return {
      kind: 'unsupported',
      reason: 'remote-provider-not-supported',
    };
  }

  if (!initialized) {
    return {
      kind: 'pending',
      provider,
      reason: 'session-not-ready',
    };
  }

  if (!hasResolvedProviderSessionId(uiSessionId, providerSessionId)) {
    return {
      kind: 'pending',
      provider,
      reason: 'provider-session-pending',
    };
  }

  return {
    kind: 'supported',
    provider,
  };
}

export function getMatchedSessionSubagents(
  agentId: string | undefined,
  agentCommand: string | undefined,
  providerSessionId: string | undefined,
  subagents: LiveAgentSubagent[]
): LiveAgentSubagent[] {
  if (!providerSessionId) {
    return [];
  }

  const provider = resolveSessionSubagentProvider(agentId, agentCommand);
  if (!provider) {
    const hasProviderMetadata =
      normalizeAgentBaseId(agentId).length > 0 || normalizeAgentBaseId(agentCommand).length > 0;

    if (hasProviderMetadata) {
      return [];
    }

    return subagents.filter((subagent) => subagent.rootThreadId === providerSessionId);
  }

  return subagents.filter(
    (subagent) => subagent.provider === provider && subagent.rootThreadId === providerSessionId
  );
}

export function supportsSessionSubagentTracking(agentId?: string, agentCommand?: string): boolean {
  return resolveSessionSubagentProvider(agentId, agentCommand) !== null;
}
