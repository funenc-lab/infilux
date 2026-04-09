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
    if (record.lastKnownState === 'dead') {
      return 'dead';
    }

    const serverName = resolveTmuxServerNameForPersistentAgentHostSessionKey(
      record.hostSessionKey,
      this.runtimeChannel
    );
    const exists = await tmuxDetector.hasSession(record.hostSessionKey, serverName);
    return exists ? 'live' : 'missing-host-session';
  }
}
