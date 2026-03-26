import type { PersistentAgentRuntimeState, PersistentAgentSessionRecord } from '@shared/types';
import { tmuxDetector } from '../../cli/TmuxDetector';
import type { PersistentSessionHost } from '../SessionHost';

export class TmuxSessionHost implements PersistentSessionHost {
  readonly kind = 'tmux' as const;

  async probeSession(record: PersistentAgentSessionRecord): Promise<PersistentAgentRuntimeState> {
    if (record.lastKnownState === 'dead') {
      return 'dead';
    }

    const exists = await tmuxDetector.hasSession(record.hostSessionKey);
    return exists ? 'live' : 'missing-host-session';
  }
}
