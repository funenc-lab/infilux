export type PersistentAgentHostKind = 'tmux' | 'supervisor';

export type PersistentAgentRecoveryPolicy = 'auto' | 'manual' | 'metadata-only';

export type PersistentAgentRuntimeState = 'live' | 'reconnecting' | 'dead' | 'missing-host-session';

export interface PersistentAgentSessionRecord {
  uiSessionId: string;
  backendSessionId?: string;
  providerSessionId?: string;
  agentId: string;
  agentCommand: string;
  customPath?: string;
  customArgs?: string;
  environment: 'native' | 'hapi' | 'happy';
  repoPath: string;
  cwd: string;
  displayName: string;
  activated: boolean;
  initialized: boolean;
  hostKind: PersistentAgentHostKind;
  hostSessionKey: string;
  recoveryPolicy: PersistentAgentRecoveryPolicy;
  createdAt: number;
  updatedAt: number;
  lastKnownState: PersistentAgentRuntimeState;
  metadata?: Record<string, unknown>;
}

export interface AgentSessionRestoreItem {
  record: PersistentAgentSessionRecord;
  runtimeState: PersistentAgentRuntimeState;
  recoverable: boolean;
  reason?: string;
}

export interface RestoreWorktreeSessionsRequest {
  repoPath: string;
  cwd: string;
}

export interface RestoreWorktreeSessionsResult {
  items: AgentSessionRestoreItem[];
}
