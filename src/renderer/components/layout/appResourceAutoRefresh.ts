export const APP_RESOURCE_AUTO_REFRESH_INTERVAL_MS = 2_000;

type TimerHandle = ReturnType<typeof globalThis.setInterval> | number;

interface AppResourceAutoRefreshControllerOptions {
  intervalMs?: number;
  setIntervalFn?: (callback: () => void, delay: number) => TimerHandle;
  clearIntervalFn?: (handle: TimerHandle) => void;
}

interface AppResourceAutoRefreshSyncOptions {
  enabled: boolean;
  onRefresh: () => void;
}

export interface AppResourceAutoRefreshController {
  sync: (options: AppResourceAutoRefreshSyncOptions) => void;
  dispose: () => void;
}

export function createAppResourceAutoRefreshController(
  options: AppResourceAutoRefreshControllerOptions = {}
): AppResourceAutoRefreshController {
  const intervalMs = options.intervalMs ?? APP_RESOURCE_AUTO_REFRESH_INTERVAL_MS;
  const setIntervalFn = options.setIntervalFn ?? globalThis.setInterval.bind(globalThis);
  const clearIntervalFn = options.clearIntervalFn ?? globalThis.clearInterval.bind(globalThis);

  let intervalHandle: TimerHandle | null = null;
  let latestRefresh: (() => void) | null = null;

  const stop = () => {
    if (intervalHandle === null) {
      return;
    }

    clearIntervalFn(intervalHandle);
    intervalHandle = null;
  };

  return {
    sync: ({ enabled, onRefresh }) => {
      latestRefresh = onRefresh;

      if (!enabled) {
        stop();
        return;
      }

      if (intervalHandle !== null) {
        return;
      }

      intervalHandle = setIntervalFn(() => {
        latestRefresh?.();
      }, intervalMs);
    },
    dispose: () => {
      latestRefresh = null;
      stop();
    },
  };
}
