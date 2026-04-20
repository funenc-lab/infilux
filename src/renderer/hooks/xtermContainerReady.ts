interface ScheduleXtermContainerReadyOptions {
  container: HTMLElement;
  onReady: () => void;
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (handle: number) => void;
}

export function isXtermContainerReady(container: HTMLElement | null): container is HTMLElement {
  if (!container || !container.isConnected) {
    return false;
  }

  const rect = container.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function scheduleXtermContainerReady({
  container,
  onReady,
  requestAnimationFrame,
  cancelAnimationFrame,
}: ScheduleXtermContainerReadyOptions): () => void {
  if (isXtermContainerReady(container)) {
    onReady();
    return () => {};
  }

  let frameId: number | null = null;
  let cancelled = false;

  const pollUntilReady = () => {
    frameId = null;

    if (cancelled) {
      return;
    }

    if (isXtermContainerReady(container)) {
      onReady();
      return;
    }

    frameId = requestAnimationFrame(pollUntilReady);
  };

  frameId = requestAnimationFrame(pollUntilReady);

  return () => {
    cancelled = true;

    if (frameId !== null) {
      cancelAnimationFrame(frameId);
    }
  };
}
