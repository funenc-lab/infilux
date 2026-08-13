interface ScheduleXtermActivationRefreshOptions {
  fitViewport: () => void;
  refresh: () => void;
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (handle: number) => void;
}

export function scheduleXtermActivationRefresh({
  fitViewport,
  refresh,
  requestAnimationFrame,
  cancelAnimationFrame,
}: ScheduleXtermActivationRefreshOptions): () => void {
  let outerFrameId: number | null = requestAnimationFrame(() => {
    outerFrameId = null;
    innerFrameId = requestAnimationFrame(() => {
      innerFrameId = null;
      fitViewport();
      refresh();
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
