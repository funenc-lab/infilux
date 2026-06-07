import type { SessionRuntimeState } from '@shared/types';

export type TerminalRuntimeOverlayState = 'reconnecting' | 'disconnected';

export function resolveTerminalRuntimeOverlayState({
  includeLocalRuntime = false,
  isLoading,
  isRemoteExecution,
  runtimeState,
}: {
  includeLocalRuntime?: boolean;
  isLoading: boolean;
  isRemoteExecution: boolean;
  runtimeState: SessionRuntimeState;
}): TerminalRuntimeOverlayState | null {
  if (isLoading || runtimeState === 'live') {
    return null;
  }

  if (!isRemoteExecution && !includeLocalRuntime) {
    return null;
  }

  return runtimeState === 'reconnecting' ? 'reconnecting' : 'disconnected';
}
