import type {
  PersistentAgentRuntimeState,
  PersistentAgentSessionRecord,
  RestoreWorktreeSessionsRequest,
  RestoreWorktreeSessionsResult,
} from '@shared/types';
import { isRemoteVirtualPath } from '@shared/utils/remotePath';
import { normalizeWorkspaceKey } from '@shared/utils/workspace';
import { requestMainProcessDiagnosticsCapture } from '../../utils/mainProcessDiagnostics';
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

function hasUnresolvedProviderRecoveryIdentity(record: PersistentAgentSessionRecord): boolean {
  return (
    !record.providerSessionId ||
    record.providerSessionId.length === 0 ||
    record.providerSessionId === record.uiSessionId ||
    record.providerSessionId === record.hostSessionKey
  );
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

function hasResolvedProviderSessionIdentity(record: PersistentAgentSessionRecord): boolean {
  return Boolean(
    record.providerSessionId &&
      record.providerSessionId.length > 0 &&
      record.providerSessionId !== record.uiSessionId &&
      record.providerSessionId !== record.hostSessionKey
  );
}

function compareRecoveryItemPriority(
  left: RestoreWorktreeSessionsResult['items'][number],
  right: RestoreWorktreeSessionsResult['items'][number]
): number {
  if (left.recoverable !== right.recoverable) {
    return left.recoverable ? -1 : 1;
  }

  if (right.record.updatedAt !== left.record.updatedAt) {
    return right.record.updatedAt - left.record.updatedAt;
  }

  return left.record.uiSessionId.localeCompare(right.record.uiSessionId);
}

function deduplicateRecoveredWorktreeItems(
  items: RestoreWorktreeSessionsResult['items']
): RestoreWorktreeSessionsResult['items'] {
  const passthrough: RestoreWorktreeSessionsResult['items'] = [];
  const grouped = new Map<string, RestoreWorktreeSessionsResult['items']>();

  for (const item of items) {
    const record = item.record;
    if (!hasResolvedProviderSessionIdentity(record)) {
      passthrough.push(item);
      continue;
    }

    const key = `provider:${record.providerSessionId}`;
    const existing = grouped.get(key) ?? [];
    existing.push(item);
    grouped.set(key, existing);
  }

  for (const providerItems of grouped.values()) {
    const deadItems = providerItems.filter((item) => item.runtimeState === 'dead');
    const recoverableOrMissingHostItems = providerItems.filter(
      (item) => item.runtimeState !== 'dead'
    );

    if (recoverableOrMissingHostItems.length > 0) {
      const preferred = [...recoverableOrMissingHostItems].sort(compareRecoveryItemPriority)[0];
      if (preferred) {
        passthrough.push(preferred);
      }
    }

    passthrough.push(...deadItems);
  }

  return [...passthrough].sort((left, right) => compareByUpdatedAtDesc(left.record, right.record));
}

type PersistentAgentSessionRepositoryPort = Pick<
  PersistentAgentSessionRepository,
  'listSessions' | 'listCachedSessions' | 'getSession' | 'upsertSession' | 'deleteSession'
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

  async upsertSession(record: PersistentAgentSessionRecord): Promise<void> {
    const existingRecord = await this.repository.getSession(record.uiSessionId);
    const preservesAuthoritativeState =
      existingRecord?.hostKind === record.hostKind &&
      existingRecord.hostSessionKey === record.hostSessionKey &&
      (existingRecord.lastKnownState === 'dead' ||
        existingRecord.lastKnownState === 'missing-host-session');
    const nextRecord = preservesAuthoritativeState
      ? { ...record, lastKnownState: existingRecord.lastKnownState }
      : record;
    await this.repository.upsertSession(nextRecord);
  }

  async abandonSession(uiSessionId: string): Promise<PersistentAgentSessionRecord[]> {
    await this.repository.deleteSession(uiSessionId);
    return this.listSessions();
  }

  async reconcileSession(uiSessionId: string) {
    const record = await this.repository.getSession(uiSessionId);
    if (!record || !supportsPersistentAgentRecovery(record)) {
      return null;
    }
    return this.toRecoveryItem(await this.reconcileRecord(record));
  }

  async restoreWorktreeSessions(
    request: RestoreWorktreeSessionsRequest
  ): Promise<RestoreWorktreeSessionsResult> {
    const items = await this.listRecoverableWorktreeSessions(request);
    return { items };
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

    return deduplicateRecoveredWorktreeItems(
      reconciled.map((record) => this.toRecoveryItem(record))
    );
  }

  private async reconcileRecord(
    record: PersistentAgentSessionRecord,
    options: { persistOnChange?: boolean } = {}
  ): Promise<PersistentAgentSessionRecord> {
    const host = this.resolveHost(record);
    const probedState = await host.probeSession(record);
    if (probedState === 'missing-host-session' && hasUnresolvedProviderRecoveryIdentity(record)) {
      requestMainProcessDiagnosticsCapture({
        event: 'persistent-agent-session-recovery-provider-unresolved',
        level: 'warn',
        throttleKey: `persistent-agent-session-recovery-provider-unresolved:${record.uiSessionId}`,
        persistence: 'never',
        context: {
          uiSessionId: record.uiSessionId,
          providerSessionId: record.providerSessionId ?? null,
          backendSessionId: record.backendSessionId ?? null,
          agentId: record.agentId,
          hostKind: record.hostKind,
          hostSessionKey: record.hostSessionKey,
          repoPath: record.repoPath,
          cwd: record.cwd,
        },
      });
    }
    if (probedState === record.lastKnownState) {
      return record;
    }

    const nextRecord: PersistentAgentSessionRecord = {
      ...record,
      lastKnownState: probedState,
      updatedAt: Date.now(),
    };
    if (options.persistOnChange ?? true) {
      await this.repository.upsertSession(nextRecord);
    }
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
