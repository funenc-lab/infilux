import type { PersistentAgentRuntimeState } from '@shared/types';

export function shouldRetryDeadAgentSession(options: {
  persistenceEnabled: boolean;
  recovered?: boolean;
  recoveryState?: PersistentAgentRuntimeState;
  hostSessionKey?: string;
}): boolean {
  return Boolean(
    options.persistenceEnabled &&
      options.recovered &&
      options.hostSessionKey &&
      options.recoveryState !== 'missing-host-session'
  );
}
