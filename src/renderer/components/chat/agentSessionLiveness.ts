import type { PersistentAgentRuntimeState } from '@shared/types';

interface AgentSessionLivenessCandidate {
  initialized: boolean;
  recoveryState?: PersistentAgentRuntimeState;
}

export function isOpenAgentSession(session: AgentSessionLivenessCandidate): boolean {
  return (
    session.initialized &&
    session.recoveryState !== 'dead' &&
    session.recoveryState !== 'missing-host-session'
  );
}
