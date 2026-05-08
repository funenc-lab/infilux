export type LiveAgentSubagentStatus = 'running' | 'waiting' | 'stale' | 'completed';
export type AgentSubagentTranscriptEntryKind = 'message' | 'tool_call';
export type AgentSubagentTranscriptEntryRole = 'assistant' | 'developer' | 'user';

export interface LiveAgentSubagent {
  id: string;
  provider: 'codex';
  threadId: string;
  rootThreadId?: string;
  parentThreadId: string;
  cwd: string;
  label: string;
  agentType?: string;
  summary?: string;
  lastSeenAt: number;
  status: LiveAgentSubagentStatus;
}

export interface ListLiveAgentSubagentsRequest {
  cwds?: string[];
  maxIdleMs?: number;
}

export interface ListLiveAgentSubagentsResult {
  items: LiveAgentSubagent[];
  generatedAt: number;
}

export interface ListSessionAgentSubagentsRequest {
  providerSessionId: string;
  cwd?: string;
  maxIdleMs?: number;
  liveItems?: LiveAgentSubagent[];
  generatedAt?: number;
}

export interface ListSessionAgentSubagentsResult {
  items: LiveAgentSubagent[];
  generatedAt: number;
}

export interface SessionAgentSubagentSubscriptionTarget {
  sessionId: string;
  providerSessionId: string;
  cwd: string;
}

export interface SubscribeSessionAgentSubagentsRequest {
  subscriptionId: string;
  targets: SessionAgentSubagentSubscriptionTarget[];
  pollIntervalMs?: number;
}

export interface UnsubscribeSessionAgentSubagentsRequest {
  subscriptionId: string;
}

export interface SessionAgentSubagentsUpdatedEvent {
  subscriptionId: string;
  itemsBySessionId: Record<string, LiveAgentSubagent[]>;
  generatedAt: number;
}

export interface AgentSubagentTranscriptEntry {
  id: string;
  timestamp: number;
  kind: AgentSubagentTranscriptEntryKind;
  role: AgentSubagentTranscriptEntryRole;
  text: string;
  phase?: string;
  toolName?: string;
}

export interface GetAgentSubagentTranscriptRequest {
  threadId: string;
}

export interface GetAgentSubagentTranscriptResult {
  provider: 'codex';
  threadId: string;
  parentThreadId?: string;
  cwd?: string;
  label: string;
  agentType?: string;
  agentNickname?: string;
  entries: AgentSubagentTranscriptEntry[];
  truncated?: boolean;
  omittedEntryCount?: number;
  generatedAt: number;
}
