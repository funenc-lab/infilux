import type { PersistentAgentRuntimeState, SessionRuntimeState } from '@shared/types';

export type AgentInputAvailability =
  | 'ready'
  | 'awaiting-session'
  | 'reconnecting'
  | 'disconnected'
  | 'recovery-required';

type RuntimeAvailabilityState = PersistentAgentRuntimeState | SessionRuntimeState | undefined;

function hasUnresolvedProviderRecoveryIdentity(options: {
  uiSessionId?: string | null;
  providerSessionId?: string | null;
}): boolean {
  if (!options.uiSessionId) {
    return false;
  }

  return !options.providerSessionId || options.providerSessionId === options.uiSessionId;
}

export function resolveAgentInputAvailability(options: {
  backendSessionId?: string | null;
  runtimeState?: RuntimeAvailabilityState;
  uiSessionId?: string | null;
  providerSessionId?: string | null;
}): AgentInputAvailability {
  if (options.runtimeState === 'reconnecting') {
    return 'reconnecting';
  }

  if (
    options.runtimeState === 'missing-host-session' &&
    hasUnresolvedProviderRecoveryIdentity({
      uiSessionId: options.uiSessionId,
      providerSessionId: options.providerSessionId,
    })
  ) {
    return 'recovery-required';
  }

  if (options.runtimeState && options.runtimeState !== 'live') {
    return 'disconnected';
  }

  if (!options.backendSessionId) {
    return 'awaiting-session';
  }

  return 'ready';
}

export function resolveAgentInputUnavailableReason(options: {
  agentCommand: string;
  availability: AgentInputAvailability;
  isRemoteExecution: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
}): string | undefined {
  switch (options.availability) {
    case 'awaiting-session':
      return options.t('Session is starting. Input will be available when the prompt appears.');
    case 'reconnecting':
      return options.t('Remote terminal input is temporarily disabled while reconnecting.');
    case 'disconnected':
      return options.isRemoteExecution
        ? options.t('Remote terminal has disconnected. Reconnect the remote host to continue.')
        : 'Terminal session is unavailable. Start a fresh session to continue.';
    case 'recovery-required':
      return 'Persistent host recovery is unavailable and this session cannot resume automatically. Start a fresh session to continue.';
    default:
      return undefined;
  }
}
