import type {
  PersistentAgentSessionRecord,
  ReadAgentProviderSessionTitleRequest,
  ResolveAgentProviderSessionRequest,
  RestoreWorktreeSessionsRequest,
} from '@shared/types';
import { IPC_CHANNELS } from '@shared/types';
import {
  normalizePersistentAgentSessionMetadata,
  PERSISTENT_AGENT_SESSION_METADATA_BYTE_LIMIT,
} from '@shared/utils/persistentAgentSession';
import { ipcMain } from 'electron';
import { agentProviderSessionService } from '../services/agent/AgentProviderSessionService';
import { persistentAgentSessionService } from '../services/session/PersistentAgentSessionService';
import { registerMainProcessDiagnosticsCollector } from '../utils/mainProcessDiagnostics';

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
const MAX_METADATA_BYTES = PERSISTENT_AGENT_SESSION_METADATA_BYTE_LIMIT;

interface AgentSessionHandlerDiagnosticsSnapshot {
  listRecoverableCalls: number;
  restoreWorktreeCalls: number;
  reconcileCalls: number;
  resolveProviderCalls: number;
  readProviderTitleCalls: number;
  markPersistentCalls: number;
  abandonCalls: number;
  lastMarkedPersistentSessionId: string | null;
  lastMarkedPersistentAt: number | null;
}

const agentSessionHandlerDiagnostics: AgentSessionHandlerDiagnosticsSnapshot = {
  listRecoverableCalls: 0,
  restoreWorktreeCalls: 0,
  reconcileCalls: 0,
  resolveProviderCalls: 0,
  readProviderTitleCalls: 0,
  markPersistentCalls: 0,
  abandonCalls: 0,
  lastMarkedPersistentSessionId: null,
  lastMarkedPersistentAt: null,
};

export function getAgentSessionHandlerDiagnosticsSnapshot(): AgentSessionHandlerDiagnosticsSnapshot {
  return { ...agentSessionHandlerDiagnostics };
}

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

function isOptionalString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string';
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
    (value.uiSessionId !== undefined && !isNonEmptyString(value.uiSessionId)) ||
    (value.providerSessionId !== undefined && !isNonEmptyString(value.providerSessionId)) ||
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
    ...(typeof value.uiSessionId === 'string' ? { uiSessionId: value.uiSessionId } : {}),
    cwd: value.cwd,
    createdAt: value.createdAt,
    observedAt: value.observedAt,
    ...(typeof value.providerSessionId === 'string'
      ? { providerSessionId: value.providerSessionId }
      : {}),
  };
}

function assertReadProviderSessionTitleRequest(
  value: unknown
): ReadAgentProviderSessionTitleRequest {
  if (
    !isPlainObject(value) ||
    !isNonEmptyString(value.agentCommand) ||
    !isNonEmptyString(value.providerSessionId) ||
    (value.cwd !== undefined && !isNonEmptyString(value.cwd))
  ) {
    throw new Error('Invalid agent provider session title request');
  }

  return {
    agentCommand: value.agentCommand,
    providerSessionId: value.providerSessionId,
    ...(typeof value.cwd === 'string' ? { cwd: value.cwd } : {}),
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

function normalizeRecordMetadata(value: unknown): Record<string, unknown> | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isPlainObject(value)) {
    return null;
  }
  return normalizePersistentAgentSessionMetadata(value);
}

function isValidPersistentRecord(
  value: Record<string, unknown>,
  metadata: Record<string, unknown> | undefined
): boolean {
  return (
    REQUIRED_STRING_FIELDS.every((field) => isNonEmptyString(value[field])) &&
    OPTIONAL_STRING_FIELDS.every((field) => isOptionalString(value[field])) &&
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
    isValidMetadata(metadata)
  );
}

function assertPersistentAgentSessionRecord(value: unknown): PersistentAgentSessionRecord {
  if (!isPlainObject(value)) {
    throw new Error('Invalid persistent agent session record');
  }

  const normalizedMetadata = normalizeRecordMetadata(value.metadata);
  if (normalizedMetadata === null || !isValidPersistentRecord(value, normalizedMetadata)) {
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

  if (typeof value.backendSessionId === 'string') {
    record.backendSessionId = value.backendSessionId as string;
  }
  if (typeof value.providerSessionId === 'string') {
    record.providerSessionId = value.providerSessionId as string;
  }
  if (typeof value.customPath === 'string') {
    record.customPath = value.customPath as string;
  }
  if (typeof value.customArgs === 'string') {
    record.customArgs = value.customArgs as string;
  }
  if (normalizedMetadata !== undefined) {
    record.metadata = normalizedMetadata;
  }

  return record;
}

registerMainProcessDiagnosticsCollector('agentSessionHandlers', () =>
  getAgentSessionHandlerDiagnosticsSnapshot()
);

export function registerAgentSessionHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.AGENT_SESSION_LIST_RECOVERABLE, async () => {
    agentSessionHandlerDiagnostics.listRecoverableCalls += 1;
    return persistentAgentSessionService.listRecoverableSessions();
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_SESSION_RESTORE_WORKTREE, async (_, request: unknown) => {
    agentSessionHandlerDiagnostics.restoreWorktreeCalls += 1;
    return persistentAgentSessionService.restoreWorktreeSessions(
      assertRestoreWorktreeSessionsRequest(request)
    );
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_SESSION_RECONCILE, async (_, uiSessionId: unknown) => {
    agentSessionHandlerDiagnostics.reconcileCalls += 1;
    return persistentAgentSessionService.reconcileSession(assertAgentSessionId(uiSessionId));
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_SESSION_RESOLVE_PROVIDER, async (_, request: unknown) => {
    agentSessionHandlerDiagnostics.resolveProviderCalls += 1;
    return agentProviderSessionService.resolveProviderSession(
      assertResolveProviderSessionRequest(request)
    );
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_SESSION_READ_PROVIDER_TITLE, async (_, request: unknown) => {
    agentSessionHandlerDiagnostics.readProviderTitleCalls += 1;
    return agentProviderSessionService.readProviderSessionTitle(
      assertReadProviderSessionTitleRequest(request)
    );
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_SESSION_MARK_PERSISTENT, async (_, record: unknown) => {
    const validatedRecord = assertPersistentAgentSessionRecord(record);
    agentSessionHandlerDiagnostics.markPersistentCalls += 1;
    agentSessionHandlerDiagnostics.lastMarkedPersistentSessionId = validatedRecord.uiSessionId;
    agentSessionHandlerDiagnostics.lastMarkedPersistentAt = Date.now();
    return persistentAgentSessionService.upsertSession(validatedRecord);
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_SESSION_ABANDON, async (_, uiSessionId: unknown) => {
    agentSessionHandlerDiagnostics.abandonCalls += 1;
    const validatedUiSessionId = assertAgentSessionId(uiSessionId);
    agentProviderSessionService.releaseProviderSession(validatedUiSessionId);
    return persistentAgentSessionService.abandonSession(validatedUiSessionId);
  });
}
