export interface AgentInputDispatchRequest {
  sessionId: string;
  agentId?: string;
  text: string;
  submit?: boolean;
  submitDelayMs?: number;
}
