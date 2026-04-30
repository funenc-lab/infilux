import type { PersistentAgentRuntimeState, PersistentAgentSessionRecord } from '@shared/types';
import { localSupervisorRuntime } from '../LocalSupervisorRuntime';
import type { PersistentSessionHost } from '../SessionHost';

export class SupervisorSessionHost implements PersistentSessionHost {
  readonly kind = 'supervisor' as const;

  async probeSession(record: PersistentAgentSessionRecord): Promise<PersistentAgentRuntimeState> {
    const sessionKey = record.backendSessionId ?? record.hostSessionKey;
    if (!sessionKey) {
      return 'missing-host-session';
    }

    const exists = await localSupervisorRuntime.hasSession(sessionKey).catch(() => null);
    if (exists === true) {
      return 'live';
    }
    if (exists === null) {
      return record.lastKnownState;
    }
    return record.lastKnownState === 'dead' ? 'dead' : 'missing-host-session';
  }
}
