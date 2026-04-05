import { getAgentInputBaseId } from './agentInputMode';

interface SessionBarProviderSwitcherSessionLike {
  agentId?: string;
  agentCommand?: string;
}

export function supportsClaudeProviderSwitcher(
  session: SessionBarProviderSwitcherSessionLike | null | undefined
): boolean {
  if (!session) {
    return true;
  }

  const candidates = [session.agentId, session.agentCommand].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  );

  if (candidates.length === 0) {
    return true;
  }

  return candidates.some((value) => getAgentInputBaseId(value) === 'claude');
}
