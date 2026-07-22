export type PersistentAgentHostKind = 'tmux' | 'supervisor';

export type PersistentAgentRecoveryPolicy = 'auto' | 'manual' | 'metadata-only';

export type PersistentAgentRuntimeState = 'live' | 'reconnecting' | 'dead' | 'missing-host-session';

export const AGENT_SESSION_TITLE_SOURCES = [
  'default',
  'launch-prompt',
  'enhanced-input',
  'provider-transcript',
  'manual',
] as const;

export type AgentSessionTitleSource = (typeof AGENT_SESSION_TITLE_SOURCES)[number];

export function isAgentSessionTitleSource(value: unknown): value is AgentSessionTitleSource {
  return (
    typeof value === 'string' && (AGENT_SESSION_TITLE_SOURCES as readonly string[]).includes(value)
  );
}

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

export interface ResolveAgentProviderSessionRequest {
  agentCommand: string;
  uiSessionId?: string;
  cwd: string;
  createdAt: number;
  observedAt: number;
  providerSessionId?: string;
}

export interface ResolveAgentProviderSessionResult {
  providerSessionId: string | null;
}

export interface ReadAgentProviderSessionTitleRequest {
  agentCommand: string;
  providerSessionId: string;
}

export interface ReadAgentProviderSessionTitleResult {
  title: string | null;
}
