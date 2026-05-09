export const AGENT_STARTUP_RECOVERY_INACTIVITY_THRESHOLD_MS = 30 * 60 * 1000;

export interface AgentStartupOverlayVisibilityInput {
  createdAt?: number;
  hasPendingCommand: boolean;
  hasRenderableContent: boolean;
  isActive: boolean;
  isLoading: boolean;
  isFirstOutputPending: boolean;
  isReadinessPending: boolean;
  isTerminalActivationPending: boolean;
  isVisible: boolean;
  lastActivityAt?: number;
  now?: number;
  recoveryState?: string;
}

export function shouldShowAgentStartupOverlayForVisibility({
  hasPendingCommand,
  hasRenderableContent,
  isActive,
  isFirstOutputPending,
  isLoading,
  isReadinessPending,
  isTerminalActivationPending,
  isVisible,
  lastActivityAt,
  now = Date.now(),
  recoveryState,
}: AgentStartupOverlayVisibilityInput): boolean {
  if (hasRenderableContent) {
    return false;
  }

  if (!isVisible && !isActive && !hasPendingCommand) {
    return false;
  }

  if (!isLoading && !isReadinessPending && !isTerminalActivationPending && !isFirstOutputPending) {
    return false;
  }

  if (isActive || hasPendingCommand) {
    return true;
  }

  if (!Number.isFinite(lastActivityAt)) {
    return recoveryState === 'missing-host-session';
  }

  return now - Number(lastActivityAt) >= AGENT_STARTUP_RECOVERY_INACTIVITY_THRESHOLD_MS;
}
