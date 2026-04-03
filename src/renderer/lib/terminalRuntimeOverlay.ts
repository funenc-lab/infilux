import type { SessionRuntimeState } from '@shared/types';

export type TerminalRuntimeOverlayState = 'reconnecting' | 'disconnected';

export function resolveTerminalRuntimeOverlayState({
  isLoading,
  isRemoteExecution,
  runtimeState,
}: {
  isLoading: boolean;
  isRemoteExecution: boolean;
  runtimeState: SessionRuntimeState;
}): TerminalRuntimeOverlayState | null {
  if (isLoading || !isRemoteExecution || runtimeState === 'live') {
    return null;
  }

  return runtimeState === 'reconnecting' ? 'reconnecting' : 'disconnected';
}
