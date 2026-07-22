export interface XtermViewportSyncController {
  flush: () => boolean;
  request: () => boolean;
  reset: () => void;
}

interface CreateXtermViewportSyncControllerOptions {
  isTerminalWriteInProgress: () => boolean;
  syncViewport: () => boolean;
}

export function createXtermViewportSyncController({
  isTerminalWriteInProgress,
  syncViewport,
}: CreateXtermViewportSyncControllerOptions): XtermViewportSyncController {
  let hasPendingViewportSync = false;

  const flush = (): boolean => {
    if (!hasPendingViewportSync || isTerminalWriteInProgress()) {
      return false;
    }

    hasPendingViewportSync = false;
    return syncViewport();
  };

  return {
    request: () => {
      hasPendingViewportSync = true;
      return flush();
    },
    flush,
    reset: () => {
      hasPendingViewportSync = false;
    },
  };
}
