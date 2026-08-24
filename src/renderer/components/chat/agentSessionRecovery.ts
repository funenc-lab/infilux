import type { PersistentAgentSessionRecord, RestoreWorktreeSessionsResult } from '@shared/types';
import { isRemoteVirtualPath } from '@shared/utils/remotePath';
import { normalizePath } from '@/App/storage';
import { matchesAgentSessionScope } from './agentSessionScope';
import type { AgentGroupState } from './types';

interface RestoreWorktreeAgentSessionsOptions {
  repoPath: string;
  cwd: string;
  restoreWorktreeSessions: (request: {
    repoPath: string;
    cwd: string;
  }) => Promise<RestoreWorktreeSessionsResult>;
  upsertRecoveredSession: (record: PersistentAgentSessionRecord) => void;
  updateGroupState: (cwd: string, updater: (state: AgentGroupState) => AgentGroupState) => void;
}

const completedRecoveryKeys = new Set<string>();
const inFlightRecoveryRequests = new Map<string, Promise<string[]>>();
const recoveryStateListeners = new Set<() => void>();

function buildRecoveryKey(repoPath: string, cwd: string): string {
  return `${normalizePath(repoPath)}::${normalizePath(cwd)}`;
}

function emitRecoveryStateChange(): void {
  for (const listener of recoveryStateListeners) {
    listener();
  }
}

function getActiveGroupId(state: AgentGroupState): string | null {
  if (state.groups.length === 0) {
    return null;
  }

  if (state.activeGroupId && state.groups.some((group) => group.id === state.activeGroupId)) {
    return state.activeGroupId;
  }

  return state.groups[0]?.id ?? null;
}

export function mergeRecoveredSessionsIntoGroupState(
  state: AgentGroupState,
  restoredIds: string[]
): AgentGroupState {
  if (restoredIds.length === 0 && state.groups.length === 0) {
    return state;
  }

  if (state.groups.length === 0) {
    const groupId = crypto.randomUUID();
    return {
      groups: [
        {
          id: groupId,
          sessionIds: restoredIds,
          activeSessionId: restoredIds[0] ?? null,
        },
      ],
      activeGroupId: groupId,
      flexPercents: [100],
    };
  }

  const targetGroupId = getActiveGroupId(state);
  if (!targetGroupId) {
    return state;
  }

  const existingSessionIds = new Set(state.groups.flatMap((group) => group.sessionIds));
  const missingIds = restoredIds.filter((id) => !existingSessionIds.has(id));
  let changed = targetGroupId !== state.activeGroupId;

  const groups = state.groups.map((group) => {
    if (group.id !== targetGroupId) {
      return group;
    }

    const sessionIds =
      missingIds.length > 0 ? [...group.sessionIds, ...missingIds] : [...group.sessionIds];
    const activeSessionId =
      group.activeSessionId && sessionIds.includes(group.activeSessionId)
        ? group.activeSessionId
        : (sessionIds[0] ?? null);

    if (
      missingIds.length > 0 ||
      activeSessionId !== group.activeSessionId ||
      sessionIds.length !== group.sessionIds.length
    ) {
      changed = true;
    }

    if (
      missingIds.length === 0 &&
      activeSessionId === group.activeSessionId &&
      sessionIds.length === group.sessionIds.length
    ) {
      return group;
    }

    return {
      ...group,
      sessionIds,
      activeSessionId,
    };
  });

  if (!changed) {
    return state;
  }

  return {
    ...state,
    groups,
    activeGroupId: targetGroupId,
  };
}

export async function restoreWorktreeAgentSessions({
  repoPath,
  cwd,
  restoreWorktreeSessions,
  upsertRecoveredSession,
  updateGroupState,
}: RestoreWorktreeAgentSessionsOptions): Promise<string[]> {
  if (!repoPath || !cwd || isRemoteVirtualPath(cwd)) {
    return [];
  }

  const recoveryKey = buildRecoveryKey(repoPath, cwd);
  if (completedRecoveryKeys.has(recoveryKey)) {
    return [];
  }

  const existingRequest = inFlightRecoveryRequests.get(recoveryKey);
  if (existingRequest) {
    return existingRequest;
  }

  const request = (async () => {
    const result = await restoreWorktreeSessions({ repoPath, cwd });
    const restoredIds: string[] = [];

    for (const item of result.items) {
      if (!matchesAgentSessionScope(item.record, repoPath, cwd)) {
        continue;
      }

      upsertRecoveredSession(item.record);
      restoredIds.push(item.record.uiSessionId);
    }

    if (restoredIds.length > 0) {
      updateGroupState(cwd, (state) => mergeRecoveredSessionsIntoGroupState(state, restoredIds));
    }

    completedRecoveryKeys.add(recoveryKey);
    return restoredIds;
  })().finally(() => {
    inFlightRecoveryRequests.delete(recoveryKey);
    emitRecoveryStateChange();
  });

  inFlightRecoveryRequests.set(recoveryKey, request);
  emitRecoveryStateChange();
  return request;
}

export type WorktreeAgentSessionRecoveryStatus = 'idle' | 'restoring' | 'settled';

export function getWorktreeAgentSessionRecoveryStatus(
  repoPath?: string | null,
  cwd?: string | null
): WorktreeAgentSessionRecoveryStatus {
  if (!repoPath || !cwd) {
    return 'idle';
  }

  const recoveryKey = buildRecoveryKey(repoPath, cwd);
  if (inFlightRecoveryRequests.has(recoveryKey)) {
    return 'restoring';
  }

  if (completedRecoveryKeys.has(recoveryKey)) {
    return 'settled';
  }

  return 'idle';
}

export function subscribeToWorktreeAgentSessionRecovery(listener: () => void): () => void {
  recoveryStateListeners.add(listener);
  return () => {
    recoveryStateListeners.delete(listener);
  };
}

export function resetWorktreeAgentSessionRecoveryCacheForTests(): void {
  completedRecoveryKeys.clear();
  inFlightRecoveryRequests.clear();
  recoveryStateListeners.clear();
}
