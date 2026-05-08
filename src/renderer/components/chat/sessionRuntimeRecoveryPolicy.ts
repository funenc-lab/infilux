import type { SessionRuntimeState } from '@shared/types';
import type { Session } from './SessionBar';

export function shouldIgnoreTerminalRuntimeStateRecoveryUpdate(
  session: Session,
  runtimeState: SessionRuntimeState
): boolean {
  if (runtimeState !== 'live') {
    return false;
  }

  if (session.backendSessionId) {
    return false;
  }

  if (!session.recovered) {
    return false;
  }

  return session.recoveryState !== undefined && session.recoveryState !== 'live';
}
