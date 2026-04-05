import type { PersistentAgentRuntimeState, SessionRuntimeState } from '@shared/types';

export type AgentInputAvailability = 'ready' | 'awaiting-session' | 'reconnecting' | 'disconnected';

type RuntimeAvailabilityState = PersistentAgentRuntimeState | SessionRuntimeState | undefined;

export function resolveAgentInputAvailability(options: {
  backendSessionId?: string | null;
  runtimeState?: RuntimeAvailabilityState;
}): AgentInputAvailability {
  if (!options.backendSessionId) {
    return 'awaiting-session';
  }

  if (options.runtimeState === 'reconnecting') {
    return 'reconnecting';
  }

  if (options.runtimeState && options.runtimeState !== 'live') {
    return 'disconnected';
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
      return options.t('Loading {{agent}}...', { agent: options.agentCommand });
    case 'reconnecting':
      return options.t('Remote terminal input is temporarily disabled while reconnecting.');
    case 'disconnected':
      return options.isRemoteExecution
        ? options.t('Remote terminal has disconnected. Reconnect the remote host to continue.')
        : 'Terminal session is unavailable. Start a fresh session to continue.';
    default:
      return undefined;
  }
}
