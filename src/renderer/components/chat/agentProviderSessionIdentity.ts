export interface ResolvePersistentProviderSessionIdInput {
  agentCommand: string;
  uiSessionId: string;
  providerSessionId?: string;
  hostSessionKey?: string;
  providerSessionIdentityValid?: boolean;
}

function isCodexAgentCommand(agentCommand: string): boolean {
  return agentCommand === 'codex';
}

export function isExplicitProviderSessionId(params: {
  uiSessionId: string;
  providerSessionId?: string;
  hostSessionKey?: string;
}): boolean {
  const { uiSessionId, providerSessionId, hostSessionKey } = params;
  return Boolean(
    providerSessionId &&
      providerSessionId.length > 0 &&
      providerSessionId !== uiSessionId &&
      providerSessionId !== hostSessionKey
  );
}

export function resolvePersistentProviderSessionId(
  input: ResolvePersistentProviderSessionIdInput
): string | undefined {
  const trimmedProviderSessionId = input.providerSessionId?.trim();
  const hasExplicitProviderSessionId = isExplicitProviderSessionId({
    uiSessionId: input.uiSessionId,
    providerSessionId: trimmedProviderSessionId,
    hostSessionKey: input.hostSessionKey,
  });

  if (isCodexAgentCommand(input.agentCommand)) {
    if (input.providerSessionIdentityValid === false) {
      return undefined;
    }

    return hasExplicitProviderSessionId ? trimmedProviderSessionId : undefined;
  }

  return trimmedProviderSessionId || undefined;
}
