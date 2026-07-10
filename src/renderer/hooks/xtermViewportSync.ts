import type { SessionRuntimeState } from '@shared/types';

export type XtermViewportSize = {
  cols: number;
  rows: number;
};

export type XtermViewportSyncSnapshot = XtermViewportSize & {
  sessionId: string;
};

type SyncXtermViewportToSessionOptions = {
  fitViewport: () => void;
  lastSyncedViewport: { current: XtermViewportSyncSnapshot | null };
  measureViewport: () => XtermViewportSize | null;
  resizeSession: (sessionId: string, size: XtermViewportSize) => void;
  runtimeState: SessionRuntimeState;
  sessionId: string | null;
};

function isValidViewportSize(size: XtermViewportSize | null): size is XtermViewportSize {
  return (
    size !== null &&
    Number.isFinite(size.cols) &&
    Number.isFinite(size.rows) &&
    size.cols > 0 &&
    size.rows > 0
  );
}

export function syncXtermViewportToSession({
  fitViewport,
  lastSyncedViewport,
  measureViewport,
  resizeSession,
  runtimeState,
  sessionId,
}: SyncXtermViewportToSessionOptions): boolean {
  fitViewport();

  if (runtimeState !== 'live' || !sessionId) {
    return false;
  }

  const viewportSize = measureViewport();
  if (!isValidViewportSize(viewportSize)) {
    return false;
  }

  const previousViewport = lastSyncedViewport.current;
  if (
    previousViewport?.sessionId === sessionId &&
    previousViewport.cols === viewportSize.cols &&
    previousViewport.rows === viewportSize.rows
  ) {
    return false;
  }

  resizeSession(sessionId, viewportSize);
  lastSyncedViewport.current = {
    sessionId,
    ...viewportSize,
  };
  return true;
}
