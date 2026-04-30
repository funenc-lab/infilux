import type { AgentSessionRestoreItem, PersistentAgentRuntimeState } from '@shared/types';
import { isSessionPersistable } from '@/lib/agentSessionPersistence';
import type { Session } from './SessionBar';

interface ReconcileAgentSessionExitOptions {
  sessionId: string;
  getSession: (sessionId: string) => Session | undefined;
  reconcileSession: (sessionId: string) => Promise<AgentSessionRestoreItem | null>;
  markSessionExited: (sessionId: string, recoveryState?: PersistentAgentRuntimeState) => void;
}

function resolveReconciledExitState(
  sessionId: string,
  item: AgentSessionRestoreItem | null
): PersistentAgentRuntimeState {
  if (!item || item.record.uiSessionId !== sessionId) {
    return 'dead';
  }
  return item.runtimeState;
}

export async function reconcileAgentSessionExit({
  sessionId,
  getSession,
  reconcileSession,
  markSessionExited,
}: ReconcileAgentSessionExitOptions): Promise<void> {
  const session = getSession(sessionId);
  if (!session || !isSessionPersistable(session)) {
    markSessionExited(sessionId, 'dead');
    return;
  }

  try {
    const item = await reconcileSession(sessionId);
    markSessionExited(sessionId, resolveReconciledExitState(sessionId, item));
  } catch {
    markSessionExited(sessionId, session.recoveryState ?? 'live');
  }
}
