import type {
  PersistentAgentRuntimeState,
  PersistentAgentSessionRecord,
  RestoreWorktreeSessionsRequest,
  RestoreWorktreeSessionsResult,
} from '@shared/types';
import { isRemoteVirtualPath } from '@shared/utils/remotePath';
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

    return reconciled.map((record) => ({
      record,
      runtimeState: record.lastKnownState,
      recoverable: isRecoverableState(record.lastKnownState),
      reason: buildRecoveryReason(record.lastKnownState),
    }));
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
    const items = (await this.listRecoverableSessions()).filter(
      (item) => item.record.repoPath === request.repoPath && item.record.cwd === request.cwd
    );

    return { items };
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
}

export const persistentAgentSessionService = new PersistentAgentSessionService();
