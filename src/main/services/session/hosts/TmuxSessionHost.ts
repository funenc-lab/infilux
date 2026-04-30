import type { PersistentAgentRuntimeState, PersistentAgentSessionRecord } from '@shared/types';
import {
  type AppRuntimeChannel,
  resolveTmuxServerNameForPersistentAgentHostSessionKey,
} from '@shared/utils/runtimeIdentity';
import { getAppRuntimeChannel } from '../../../utils/runtimeIdentity';
import { tmuxDetector } from '../../cli/TmuxDetector';
import type { PersistentSessionHost } from '../SessionHost';

export class TmuxSessionHost implements PersistentSessionHost {
  readonly kind = 'tmux' as const;

  constructor(private readonly runtimeChannel: AppRuntimeChannel = getAppRuntimeChannel()) {}

  async probeSession(record: PersistentAgentSessionRecord): Promise<PersistentAgentRuntimeState> {
    const serverName = resolveTmuxServerNameForPersistentAgentHostSessionKey(
      record.hostSessionKey,
      this.runtimeChannel
    );
    const probeStatus = await tmuxDetector.probeSession(record.hostSessionKey, serverName);
    if (probeStatus === 'exists') {
      return 'live';
    }
    if (probeStatus === 'failed') {
      return record.lastKnownState;
    }
    return record.lastKnownState === 'dead' ? 'dead' : 'missing-host-session';
  }
}
