import { isRemoteVirtualPath } from '@shared/utils/remotePath';

export interface SessionPersistenceHostContext {
  cwd?: string;
  platform?: string;
  tmuxEnabled: boolean;
}

export interface PersistableSessionLike {
  activated?: boolean;
  persistenceEnabled?: boolean;
}

export function isSessionPersistenceEnabledForHost({
  cwd,
  platform,
  tmuxEnabled,
}: SessionPersistenceHostContext): boolean {
  if (!cwd || isRemoteVirtualPath(cwd)) {
    return false;
  }

  if (platform === 'win32') {
    return true;
  }

  return Boolean(tmuxEnabled);
}

export function isSessionPersistable(session: PersistableSessionLike): boolean {
  return Boolean(session.activated && session.persistenceEnabled);
}
