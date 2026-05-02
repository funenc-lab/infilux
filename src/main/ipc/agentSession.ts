import type {
  PersistentAgentSessionRecord,
  ResolveAgentProviderSessionRequest,
  RestoreWorktreeSessionsRequest,
} from '@shared/types';
import { IPC_CHANNELS } from '@shared/types';
import { ipcMain } from 'electron';
import { agentProviderSessionService } from '../services/agent/AgentProviderSessionService';
import { persistentAgentSessionService } from '../services/session/PersistentAgentSessionService';

const OPTIONAL_STRING_FIELDS = [
  'backendSessionId',
  'providerSessionId',
  'customPath',
  'customArgs',
];
const REQUIRED_STRING_FIELDS = [
  'uiSessionId',
  'agentId',
  'agentCommand',
  'repoPath',
  'cwd',
  'displayName',
  'hostSessionKey',
];
const MAX_METADATA_BYTES = 64 * 1024;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function assertAgentSessionId(value: unknown): string {
  if (!isNonEmptyString(value)) {
    throw new Error('Invalid agent session id');
  }
  return value;
}

function assertRestoreWorktreeSessionsRequest(value: unknown): RestoreWorktreeSessionsRequest {
  if (!isPlainObject(value) || !isNonEmptyString(value.repoPath) || !isNonEmptyString(value.cwd)) {
    throw new Error('Invalid agent session restore request');
  }

  return {
    repoPath: value.repoPath,
    cwd: value.cwd,
  };
}

function assertResolveProviderSessionRequest(value: unknown): ResolveAgentProviderSessionRequest {
  if (
    !isPlainObject(value) ||
    !isNonEmptyString(value.agentCommand) ||
    !isNonEmptyString(value.cwd) ||
    typeof value.createdAt !== 'number' ||
    !Number.isFinite(value.createdAt) ||
    typeof value.observedAt !== 'number' ||
    !Number.isFinite(value.observedAt)
  ) {
    throw new Error('Invalid agent provider session resolve request');
  }

  return {
    agentCommand: value.agentCommand,
    cwd: value.cwd,
    createdAt: value.createdAt,
    observedAt: value.observedAt,
  };
}

function isValidMetadata(value: unknown): value is Record<string, unknown> | undefined {
  if (value === undefined) {
    return true;
  }
  if (!isPlainObject(value)) {
    return false;
  }

  try {
    return JSON.stringify(value).length <= MAX_METADATA_BYTES;
  } catch {
    return false;
  }
}

function isValidPersistentRecord(value: Record<string, unknown>): boolean {
  return (
    REQUIRED_STRING_FIELDS.every((field) => isNonEmptyString(value[field])) &&
    OPTIONAL_STRING_FIELDS.every(
      (field) => value[field] === undefined || typeof value[field] === 'string'
    ) &&
    (value.environment === 'native' ||
      value.environment === 'hapi' ||
      value.environment === 'happy') &&
    typeof value.activated === 'boolean' &&
    typeof value.initialized === 'boolean' &&
    (value.hostKind === 'tmux' || value.hostKind === 'supervisor') &&
    (value.recoveryPolicy === 'auto' ||
      value.recoveryPolicy === 'manual' ||
      value.recoveryPolicy === 'metadata-only') &&
    typeof value.createdAt === 'number' &&
    Number.isFinite(value.createdAt) &&
    typeof value.updatedAt === 'number' &&
    Number.isFinite(value.updatedAt) &&
    (value.lastKnownState === 'live' ||
      value.lastKnownState === 'reconnecting' ||
      value.lastKnownState === 'dead' ||
      value.lastKnownState === 'missing-host-session') &&
    isValidMetadata(value.metadata)
  );
}

function assertPersistentAgentSessionRecord(value: unknown): PersistentAgentSessionRecord {
  if (!isPlainObject(value) || !isValidPersistentRecord(value)) {
    throw new Error('Invalid persistent agent session record');
  }

  const record: PersistentAgentSessionRecord = {
    uiSessionId: value.uiSessionId as string,
    agentId: value.agentId as string,
    agentCommand: value.agentCommand as string,
    environment: value.environment as PersistentAgentSessionRecord['environment'],
    repoPath: value.repoPath as string,
    cwd: value.cwd as string,
    displayName: value.displayName as string,
    activated: value.activated as boolean,
    initialized: value.initialized as boolean,
    hostKind: value.hostKind as PersistentAgentSessionRecord['hostKind'],
    hostSessionKey: value.hostSessionKey as string,
    recoveryPolicy: value.recoveryPolicy as PersistentAgentSessionRecord['recoveryPolicy'],
    createdAt: value.createdAt as number,
    updatedAt: value.updatedAt as number,
    lastKnownState: value.lastKnownState as PersistentAgentSessionRecord['lastKnownState'],
  };

  if (value.backendSessionId !== undefined) {
    record.backendSessionId = value.backendSessionId as string;
  }
  if (value.providerSessionId !== undefined) {
    record.providerSessionId = value.providerSessionId as string;
  }
  if (value.customPath !== undefined) {
    record.customPath = value.customPath as string;
  }
  if (value.customArgs !== undefined) {
    record.customArgs = value.customArgs as string;
  }
  if (value.metadata !== undefined) {
    record.metadata = value.metadata as Record<string, unknown>;
  }

  return record;
}

export function registerAgentSessionHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.AGENT_SESSION_LIST_RECOVERABLE, async () => {
    return persistentAgentSessionService.listRecoverableSessions();
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_SESSION_RESTORE_WORKTREE, async (_, request: unknown) => {
    return persistentAgentSessionService.restoreWorktreeSessions(
      assertRestoreWorktreeSessionsRequest(request)
    );
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_SESSION_RECONCILE, async (_, uiSessionId: unknown) => {
    return persistentAgentSessionService.reconcileSession(assertAgentSessionId(uiSessionId));
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_SESSION_RESOLVE_PROVIDER, async (_, request: unknown) => {
    return agentProviderSessionService.resolveProviderSession(
      assertResolveProviderSessionRequest(request)
    );
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_SESSION_MARK_PERSISTENT, async (_, record: unknown) => {
    return persistentAgentSessionService.upsertSession(assertPersistentAgentSessionRecord(record));
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_SESSION_ABANDON, async (_, uiSessionId: unknown) => {
    return persistentAgentSessionService.abandonSession(assertAgentSessionId(uiSessionId));
  });
}
