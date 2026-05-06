import type { RemoteConnectionStatus, SessionKind, SessionRuntimeInfo } from '@shared/types';
import { isRemoteVirtualPath, parseRemoteVirtualPath } from '@shared/utils/remotePath';

interface ResolveReusableBackendSessionIdParams {
  backendSessionId?: string;
  cwd?: string;
  getRemoteStatus: (connectionId: string) => Promise<Pick<RemoteConnectionStatus, 'connected'>>;
  getLocalRuntimeInfo?: (sessionId: string) => Promise<SessionRuntimeInfo | null>;
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
  // Dead-session retries should be scoped to the logical terminal binding.
  // Backend session ids can change on each retry, which would otherwise cause
  // an infinite retry loop for a single failed recovery flow.
  return [
    snapshot.cwd,
    snapshot.kind,
    snapshot.persistOnDisconnect ? 'persistent' : 'ephemeral',
  ].join('::');
}

export function shouldRetryDeadSessionRecovery(
  lastAttemptKey: string | null,
  snapshot: XtermSessionBindingSnapshot
): boolean {
  return buildXtermRecoveryAttemptKey(snapshot) !== lastAttemptKey;
}

export function shouldAttemptDeadSessionRecovery({
  allowDeadSessionRecovery,
  lastAttemptKey,
  snapshot,
}: {
  allowDeadSessionRecovery: boolean;
  lastAttemptKey: string | null;
  snapshot: XtermSessionBindingSnapshot;
}): boolean {
  if (!allowDeadSessionRecovery) {
    return false;
  }

  return shouldRetryDeadSessionRecovery(lastAttemptKey, snapshot);
}

export function shouldRearmDeadSessionRecovery({
  hasReceivedData,
  replay,
}: {
  hasReceivedData: boolean;
  replay?: string;
}): boolean {
  return hasReceivedData || Boolean(replay && replay.length > 0);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : '';
}

export function shouldRetrySessionCreateWithoutHost({
  error,
  kind,
  persistOnDisconnect,
  hostSession,
  hasFallback,
}: {
  error: unknown;
  kind: SessionKind;
  persistOnDisconnect: boolean;
  hostSession?: { kind: 'tmux'; serverName: string; sessionName: string };
  hasFallback: boolean;
}): boolean {
  if (!hasFallback || kind !== 'agent' || !persistOnDisconnect || hostSession?.kind !== 'tmux') {
    return false;
  }

  const message = getErrorMessage(error);
  return (
    message.includes('Failed to recover tmux server:') ||
    message.includes('System resources exhausted while checking tmux server:')
  );
}

export async function resolveReusableBackendSessionId({
  backendSessionId,
  cwd,
  getRemoteStatus,
  getLocalRuntimeInfo,
  allowUntrackedLocalAttach = false,
}: ResolveReusableBackendSessionIdParams): Promise<string | undefined> {
  if (!backendSessionId) {
    return undefined;
  }

  if (!cwd || !isRemoteVirtualPath(cwd)) {
    if (allowUntrackedLocalAttach) {
      return backendSessionId;
    }

    if (!cwd || !getLocalRuntimeInfo) {
      return backendSessionId;
    }

    try {
      const runtimeInfo = await getLocalRuntimeInfo(backendSessionId);
      return runtimeInfo?.isAlive === true ? backendSessionId : undefined;
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
