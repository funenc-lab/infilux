interface ScheduleXtermActivationRefreshOptions {
  fitViewport: () => void;
  refresh: () => void;
  focus: () => void;
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (handle: number) => void;
}

export function scheduleXtermActivationRefresh({
  fitViewport,
  refresh,
  focus,
  requestAnimationFrame,
  cancelAnimationFrame,
}: ScheduleXtermActivationRefreshOptions): () => void {
  let outerFrameId: number | null = requestAnimationFrame(() => {
    outerFrameId = null;
    innerFrameId = requestAnimationFrame(() => {
      innerFrameId = null;
      fitViewport();
      refresh();
      focus();
    });
  });
  let innerFrameId: number | null = null;

  return () => {
    if (outerFrameId !== null) {
      cancelAnimationFrame(outerFrameId);
    }
    if (innerFrameId !== null) {
      cancelAnimationFrame(innerFrameId);
    }
  };
}
