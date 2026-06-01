import type { SessionActivityState } from './sessionActivityState';

export const AGENT_BACKGROUND_RUNTIME_DORMANT_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export interface BackgroundAgentRuntimeMountSafetyInput {
  agentCommand?: string;
  agentId?: string;
  createdAt?: number;
  hasPendingCommand?: boolean;
  isFocused?: boolean;
  lastActivityAt?: number;
  now?: number;
  recovered?: boolean;
  recoveryState?: string;
  sessionActivityState?: SessionActivityState;
}

function isCodexSession(agentId: string | undefined, agentCommand: string | undefined): boolean {
  return agentId === 'codex' || agentCommand === 'codex';
}

function isAttentionSession(state: SessionActivityState | undefined): boolean {
  return state === 'running' || state === 'waiting_input' || state === 'completed';
}

function resolveLastRuntimeActivityAt({
  createdAt,
  lastActivityAt,
}: Pick<BackgroundAgentRuntimeMountSafetyInput, 'createdAt' | 'lastActivityAt'>): number | null {
  if (Number.isFinite(lastActivityAt)) {
    return Number(lastActivityAt);
  }

  if (Number.isFinite(createdAt)) {
    return Number(createdAt);
  }

  return null;
}

export function shouldDeferBackgroundAgentRuntimeMount({
  agentCommand,
  agentId,
  createdAt,
  hasPendingCommand = false,
  isFocused = false,
  lastActivityAt,
  now = Date.now(),
  recovered = false,
  recoveryState,
  sessionActivityState = 'idle',
}: BackgroundAgentRuntimeMountSafetyInput): boolean {
  if (!isCodexSession(agentId, agentCommand)) {
    return false;
  }

  if (!recovered || recoveryState === 'missing-host-session') {
    return false;
  }

  if (isFocused || hasPendingCommand || isAttentionSession(sessionActivityState)) {
    return false;
  }

  const lastRuntimeActivityAt = resolveLastRuntimeActivityAt({ createdAt, lastActivityAt });
  if (!Number.isFinite(lastRuntimeActivityAt)) {
    return false;
  }

  return now - Number(lastRuntimeActivityAt) >= AGENT_BACKGROUND_RUNTIME_DORMANT_THRESHOLD_MS;
}
