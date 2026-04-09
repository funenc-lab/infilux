import type { AppRuntimeChannel } from '@shared/utils/runtimeIdentity';
import { buildPersistentAgentHostSessionKey } from '@shared/utils/runtimeIdentity';

interface SessionHostKeySource {
  id: string;
  backendSessionId?: string;
  hostSessionKey?: string;
}

interface ResolveSessionPersistentHostSessionKeyOptions {
  session: SessionHostKeySource;
  platform: 'darwin' | 'win32' | 'linux';
  runtimeChannel: AppRuntimeChannel;
}

export function resolveSessionPersistentHostSessionKey({
  session,
  platform,
  runtimeChannel,
}: ResolveSessionPersistentHostSessionKeyOptions): string {
  if (platform === 'win32') {
    return session.backendSessionId ?? session.id;
  }

  return session.hostSessionKey ?? buildPersistentAgentHostSessionKey(session.id, runtimeChannel);
}
