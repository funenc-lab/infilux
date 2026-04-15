import type { SessionRuntimeState } from '@shared/types';

export type XtermViewportSize = {
  cols: number;
  rows: number;
};

type SyncXtermViewportToSessionOptions = {
  fitViewport: () => void;
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
  measureViewport,
  resizeSession,
  runtimeState,
  sessionId,
}: SyncXtermViewportToSessionOptions): boolean {
  if (runtimeState !== 'live' || !sessionId) {
    return false;
  }

  fitViewport();

  const viewportSize = measureViewport();
  if (!isValidViewportSize(viewportSize)) {
    return false;
  }

  resizeSession(sessionId, viewportSize);
  return true;
}
