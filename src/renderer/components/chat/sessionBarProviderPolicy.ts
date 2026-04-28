import { agentProviderProfileAdapter } from '@/lib/agentProviderProfiles';

interface SessionBarProviderSwitcherSessionLike {
  agentId?: string;
  agentCommand?: string;
}

export function supportsAgentProviderProfileSwitcher(
  session: SessionBarProviderSwitcherSessionLike | null | undefined
): boolean {
  return agentProviderProfileAdapter.supportsSession(session);
}
