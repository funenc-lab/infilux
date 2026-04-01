import type { RemoteConnectionStatus, SessionKind } from '@shared/types';
import { isRemoteVirtualPath, parseRemoteVirtualPath } from '@shared/utils/remotePath';

interface ResolveReusableBackendSessionIdParams {
  backendSessionId?: string;
  cwd?: string;
  getRemoteStatus: (connectionId: string) => Promise<Pick<RemoteConnectionStatus, 'connected'>>;
  getLocalActivity?: (sessionId: string) => Promise<boolean>;
  allowUntrackedLocalAttach?: boolean;
}

export interface XtermSessionBindingSnapshot {
  cwd: string;
  kind: SessionKind;
  persistOnDisconnect: boolean;
  sessionId?: string;
}

interface CreateXtermSessionBindingSnapshotParams {
  cwd: string;
  kind: SessionKind;
  persistOnDisconnect: boolean;
  sessionId?: string;
}

export function createXtermSessionBindingSnapshot({
  cwd,
  kind,
  persistOnDisconnect,
  sessionId,
}: CreateXtermSessionBindingSnapshotParams): XtermSessionBindingSnapshot {
  return {
    cwd,
    kind,
    persistOnDisconnect,
    sessionId,
  };
}

export function shouldRebindXtermSession(
  previous: XtermSessionBindingSnapshot | null,
  next: XtermSessionBindingSnapshot
): boolean {
  if (!previous) {
    return false;
  }

  if (
    previous.cwd !== next.cwd ||
    previous.kind !== next.kind ||
    previous.persistOnDisconnect !== next.persistOnDisconnect
  ) {
    return true;
  }

  return Boolean(next.sessionId && next.sessionId !== previous.sessionId);
}

export function buildXtermRecoveryAttemptKey(snapshot: XtermSessionBindingSnapshot): string {
  return [
    snapshot.cwd,
    snapshot.kind,
    snapshot.persistOnDisconnect ? 'persistent' : 'ephemeral',
    snapshot.sessionId ?? 'no-session',
  ].join('::');
}

export function shouldRetryDeadSessionRecovery(
  lastAttemptKey: string | null,
  snapshot: XtermSessionBindingSnapshot
): boolean {
  return buildXtermRecoveryAttemptKey(snapshot) !== lastAttemptKey;
}

export async function resolveReusableBackendSessionId({
  backendSessionId,
  cwd,
  getRemoteStatus,
  getLocalActivity,
  allowUntrackedLocalAttach = false,
}: ResolveReusableBackendSessionIdParams): Promise<string | undefined> {
  if (!backendSessionId) {
    return undefined;
  }

  if (!cwd || !isRemoteVirtualPath(cwd)) {
    if (allowUntrackedLocalAttach) {
      return backendSessionId;
    }

    if (!cwd || !getLocalActivity) {
      return backendSessionId;
    }

    try {
      const hasActivity = await getLocalActivity(backendSessionId);
      return hasActivity ? backendSessionId : undefined;
    } catch {
      return undefined;
    }
  }

  try {
    const { connectionId } = parseRemoteVirtualPath(cwd);
    const status = await getRemoteStatus(connectionId);
    return status.connected ? backendSessionId : undefined;
  } catch {
    return undefined;
  }
}
