import type {
  PersistentAgentRuntimeState,
  PersistentAgentSessionRecord,
  RestoreWorktreeSessionsRequest,
  RestoreWorktreeSessionsResult,
} from '@shared/types';
import { isRemoteVirtualPath } from '@shared/utils/remotePath';
import { normalizeWorkspaceKey } from '@shared/utils/workspace';
import { SupervisorSessionHost } from './hosts/SupervisorSessionHost';
import { TmuxSessionHost } from './hosts/TmuxSessionHost';
import {
  type PersistentAgentSessionRepository,
  persistentAgentSessionRepository,
} from './PersistentAgentSessionRepository';
import type { PersistentSessionHost } from './SessionHost';

function compareByUpdatedAtDesc(
  left: PersistentAgentSessionRecord,
  right: PersistentAgentSessionRecord
): number {
  return right.updatedAt - left.updatedAt;
}

function isRecoverableState(state: PersistentAgentRuntimeState): boolean {
  return state === 'live' || state === 'reconnecting';
}

function buildRecoveryReason(state: PersistentAgentRuntimeState): string | undefined {
  if (state === 'dead') {
    return 'session-dead';
  }
  if (state === 'missing-host-session') {
    return 'missing-host-session';
  }
  return undefined;
}

function defaultHostResolver(record: PersistentAgentSessionRecord): PersistentSessionHost {
  if (record.hostKind === 'supervisor') {
    return new SupervisorSessionHost();
  }
  return new TmuxSessionHost();
}

function supportsPersistentAgentRecovery(record: PersistentAgentSessionRecord): boolean {
  return !isRemoteVirtualPath(record.cwd) && !isRemoteVirtualPath(record.repoPath);
}

function getLocalWorkspacePlatform(): 'linux' | 'darwin' | 'win32' {
  return process.platform === 'win32' || process.platform === 'darwin' ? process.platform : 'linux';
}

function matchesWorktreeRequest(
  record: PersistentAgentSessionRecord,
  request: RestoreWorktreeSessionsRequest
): boolean {
  const platform = getLocalWorkspacePlatform();
  return (
    normalizeWorkspaceKey(record.repoPath, platform) ===
      normalizeWorkspaceKey(request.repoPath, platform) &&
    normalizeWorkspaceKey(record.cwd, platform) === normalizeWorkspaceKey(request.cwd, platform)
  );
}

type PersistentAgentSessionRepositoryPort = Pick<
  PersistentAgentSessionRepository,
  'listSessions' | 'listCachedSessions' | 'upsertSession' | 'deleteSession'
>;

export class PersistentAgentSessionService {
  constructor(
    private readonly repository: PersistentAgentSessionRepositoryPort = persistentAgentSessionRepository,
    private readonly resolveHost: (
      record: PersistentAgentSessionRecord
    ) => PersistentSessionHost = defaultHostResolver
  ) {}

  listCachedSessionsSync(): PersistentAgentSessionRecord[] {
    return this.repository.listCachedSessions().sort(compareByUpdatedAtDesc);
  }

  async listSessions(): Promise<PersistentAgentSessionRecord[]> {
    return (await this.repository.listSessions()).sort(compareByUpdatedAtDesc);
  }

  async listRecoverableSessions() {
    const sessions = (await this.listSessions()).filter(supportsPersistentAgentRecovery);
    const reconciled = await Promise.all(sessions.map((record) => this.reconcileRecord(record)));

    return reconciled.map((record) => this.toRecoveryItem(record));
  }

  async upsertSession(
    record: PersistentAgentSessionRecord
  ): Promise<PersistentAgentSessionRecord[]> {
    await this.repository.upsertSession(record);
    return this.listSessions();
  }

  async abandonSession(uiSessionId: string): Promise<PersistentAgentSessionRecord[]> {
    await this.repository.deleteSession(uiSessionId);
    return this.listSessions();
  }

  async reconcileSession(uiSessionId: string) {
    return (
      (await this.listRecoverableSessions()).find(
        (item) => item.record.uiSessionId === uiSessionId
      ) ?? null
    );
  }

  async restoreWorktreeSessions(
    request: RestoreWorktreeSessionsRequest
  ): Promise<RestoreWorktreeSessionsResult> {
    const items = await this.listRecoverableWorktreeSessions(request);
    const staleUiSessionIds = items
      .filter((item) => !item.recoverable)
      .map((item) => item.record.uiSessionId);

    if (staleUiSessionIds.length > 0) {
      await Promise.allSettled(
        staleUiSessionIds.map((uiSessionId) => this.repository.deleteSession(uiSessionId))
      );
    }

    return { items: items.filter((item) => item.recoverable) };
  }

  private async listRecoverableWorktreeSessions(
    request: RestoreWorktreeSessionsRequest
  ): Promise<RestoreWorktreeSessionsResult['items']> {
    const candidateRecords = (await this.listSessions()).filter(
      (record) => supportsPersistentAgentRecovery(record) && matchesWorktreeRequest(record, request)
    );
    const reconciled = await Promise.all(
      candidateRecords.map((record) => this.reconcileRecord(record))
    );

    return reconciled.map((record) => this.toRecoveryItem(record));
  }

  private async reconcileRecord(
    record: PersistentAgentSessionRecord
  ): Promise<PersistentAgentSessionRecord> {
    const host = this.resolveHost(record);
    const probedState = await host.probeSession(record);
    if (probedState === record.lastKnownState) {
      return record;
    }

    const nextRecord: PersistentAgentSessionRecord = {
      ...record,
      lastKnownState: probedState,
      updatedAt: Date.now(),
    };
    await this.repository.upsertSession(nextRecord);
    return nextRecord;
  }

  private toRecoveryItem(record: PersistentAgentSessionRecord) {
    return {
      record,
      runtimeState: record.lastKnownState,
      recoverable: isRecoverableState(record.lastKnownState),
      reason: buildRecoveryReason(record.lastKnownState),
    };
  }
}

export const persistentAgentSessionService = new PersistentAgentSessionService();
