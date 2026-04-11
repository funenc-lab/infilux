export const ACTIVE_AGENT_ACTIVITY_POLL_INTERVAL_MS = 1_000;
export const BACKGROUND_AGENT_ACTIVITY_POLL_INTERVAL_MS = 5_000;

interface ResolveAgentTerminalActivityPollIntervalMsOptions {
  isActive: boolean;
}

export function resolveAgentTerminalActivityPollIntervalMs({
  isActive,
}: ResolveAgentTerminalActivityPollIntervalMsOptions): number {
  return isActive
    ? ACTIVE_AGENT_ACTIVITY_POLL_INTERVAL_MS
    : BACKGROUND_AGENT_ACTIVITY_POLL_INTERVAL_MS;
}
