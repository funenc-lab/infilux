export const AGENT_CANVAS_ZOOM_MIN = 0.1;
export const AGENT_CANVAS_ZOOM_MAX = 4;
export const AGENT_CANVAS_ZOOM_STEP = 0.1;
export const AGENT_CANVAS_ZOOM_DEFAULT = 1;
export const AGENT_CANVAS_WHEEL_ZOOM_DELTA_THRESHOLD = 44;
export const AGENT_CANVAS_VIRTUAL_PLANE_MULTIPLIER = 9;
export const AGENT_CANVAS_FOCUS_OCCUPANCY_RATIO = 0.8;
export const AGENT_CANVAS_FLOATING_TERMINAL_FONT_SCALE_MIN = 0.9;
export const AGENT_CANVAS_FLOATING_TERMINAL_FONT_SCALE_MAX = 1.6;
export const AGENT_CANVAS_FLOATING_TERMINAL_REFERENCE_WIDTH = 720;
export const AGENT_CANVAS_FLOATING_TERMINAL_REFERENCE_HEIGHT = 540;
export const AGENT_CANVAS_ZOOM_TERMINAL_FONT_SCALE_MIN = 0.85;
export const AGENT_CANVAS_ZOOM_TERMINAL_FONT_SCALE_MAX = 1.25;
export const AGENT_CANVAS_ZOOM_TERMINAL_FONT_SCALE_STEP = 0.05;
export const AGENT_CANVAS_ZOOM_TERMINAL_FONT_SCALE_LOG_FACTOR = 0.18;
export const AGENT_CANVAS_CENTER_PROXIMITY_MIN = 40;
export const AGENT_CANVAS_CENTER_PROXIMITY_RATIO = 0.08;

function roundAgentCanvasZoom(value: number): number {
  return Math.round(value * 100) / 100;
}

function quantizeAgentCanvasTerminalFontScale(value: number): number {
  return roundAgentCanvasZoom(
    Math.round(value / AGENT_CANVAS_ZOOM_TERMINAL_FONT_SCALE_STEP) *
      AGENT_CANVAS_ZOOM_TERMINAL_FONT_SCALE_STEP
  );
}

export function clampAgentCanvasZoom(value: number): number {
  if (!Number.isFinite(value)) {
    return AGENT_CANVAS_ZOOM_DEFAULT;
  }

  return Math.min(
    AGENT_CANVAS_ZOOM_MAX,
    Math.max(AGENT_CANVAS_ZOOM_MIN, roundAgentCanvasZoom(value))
  );
}

export function stepAgentCanvasZoom(value: number, direction: 'in' | 'out'): number {
  const delta = direction === 'in' ? AGENT_CANVAS_ZOOM_STEP : -AGENT_CANVAS_ZOOM_STEP;
  return clampAgentCanvasZoom(value + delta);
}

export function stepAgentCanvasZoomByDelta(value: number, stepDelta: number): number {
  if (!Number.isFinite(stepDelta) || stepDelta === 0) {
    return clampAgentCanvasZoom(value);
  }

  return clampAgentCanvasZoom(value + stepDelta * AGENT_CANVAS_ZOOM_STEP);
}

export function formatAgentCanvasZoomPercent(value: number): string {
  return `${Math.round(clampAgentCanvasZoom(value) * 100)}%`;
}

export function resolveAgentCanvasWheelZoomDelta(pendingDelta: number): {
  nextPendingDelta: number;
  stepDelta: number;
} {
  if (!Number.isFinite(pendingDelta) || pendingDelta === 0) {
    return {
      nextPendingDelta: 0,
      stepDelta: 0,
    };
  }

  const absPendingDelta = Math.abs(pendingDelta);
  const stepCount = Math.floor(absPendingDelta / AGENT_CANVAS_WHEEL_ZOOM_DELTA_THRESHOLD);

  if (stepCount === 0) {
    return {
      nextPendingDelta: pendingDelta,
      stepDelta: 0,
    };
  }

  const direction = pendingDelta < 0 ? 1 : -1;
  const consumedDelta =
    Math.sign(pendingDelta) * stepCount * AGENT_CANVAS_WHEEL_ZOOM_DELTA_THRESHOLD;

  return {
    nextPendingDelta: pendingDelta - consumedDelta,
    stepDelta: direction * stepCount,
  };
}

export function resolveAgentCanvasScrollBehavior(prefersReducedMotion: boolean): ScrollBehavior {
  return prefersReducedMotion ? 'auto' : 'smooth';
}

export function resolveAgentCanvasViewportMetrics(value: number): {
  framePercent: number;
  planePercent: number;
  zoom: number;
} {
  const zoom = clampAgentCanvasZoom(value);

  return {
    framePercent: 100 / AGENT_CANVAS_VIRTUAL_PLANE_MULTIPLIER,
    planePercent: AGENT_CANVAS_VIRTUAL_PLANE_MULTIPLIER * 100,
    zoom,
  };
}

export function resolveAgentCanvasCenteredScrollPosition(dimensions: {
  clientHeight: number;
  clientWidth: number;
  scrollHeight: number;
  scrollWidth: number;
}): {
  left: number;
  top: number;
} {
  const left = Math.max((dimensions.scrollWidth - dimensions.clientWidth) / 2, 0);
  const top = Math.max((dimensions.scrollHeight - dimensions.clientHeight) / 2, 0);

  return { left, top };
}

function clampAgentCanvasScrollAxis(
  position: number,
  clientSize: number,
  scrollSize: number
): number {
  if (!Number.isFinite(position)) {
    return 0;
  }

  const maxPosition = Math.max(scrollSize - clientSize, 0);
  return Math.min(Math.max(position, 0), maxPosition);
}

function resolveAgentCanvasCenterProximity(clientSize: number): number {
  return Math.max(
    AGENT_CANVAS_CENTER_PROXIMITY_MIN,
    clientSize * AGENT_CANVAS_CENTER_PROXIMITY_RATIO
  );
}

export function clampAgentCanvasScrollPosition(dimensions: {
  clientHeight: number;
  clientWidth: number;
  left: number;
  scrollHeight: number;
  scrollWidth: number;
  top: number;
}): {
  left: number;
  top: number;
} {
  return {
    left: clampAgentCanvasScrollAxis(
      dimensions.left,
      dimensions.clientWidth,
      dimensions.scrollWidth
    ),
    top: clampAgentCanvasScrollAxis(
      dimensions.top,
      dimensions.clientHeight,
      dimensions.scrollHeight
    ),
  };
}

export function isAgentCanvasScrollPositionNearCenter(dimensions: {
  clientHeight: number;
  clientWidth: number;
  currentLeft: number;
  currentTop: number;
  scrollHeight: number;
  scrollWidth: number;
}): boolean {
  const centeredPosition = resolveAgentCanvasCenteredScrollPosition({
    clientHeight: dimensions.clientHeight,
    clientWidth: dimensions.clientWidth,
    scrollHeight: dimensions.scrollHeight,
    scrollWidth: dimensions.scrollWidth,
  });
  const currentPosition = clampAgentCanvasScrollPosition({
    clientHeight: dimensions.clientHeight,
    clientWidth: dimensions.clientWidth,
    left: dimensions.currentLeft,
    scrollHeight: dimensions.scrollHeight,
    scrollWidth: dimensions.scrollWidth,
    top: dimensions.currentTop,
  });

  return (
    Math.abs(currentPosition.left - centeredPosition.left) <=
      resolveAgentCanvasCenterProximity(dimensions.clientWidth) &&
    Math.abs(currentPosition.top - centeredPosition.top) <=
      resolveAgentCanvasCenterProximity(dimensions.clientHeight)
  );
}

export function resolveAgentCanvasResizeScrollPosition(dimensions: {
  currentLeft: number;
  currentTop: number;
  nextClientHeight: number;
  nextClientWidth: number;
  nextScrollHeight: number;
  nextScrollWidth: number;
  previousClientHeight: number;
  previousClientWidth: number;
  previousScrollHeight: number;
  previousScrollWidth: number;
}): {
  left: number;
  top: number;
} {
  if (
    isAgentCanvasScrollPositionNearCenter({
      clientHeight: dimensions.previousClientHeight,
      clientWidth: dimensions.previousClientWidth,
      currentLeft: dimensions.currentLeft,
      currentTop: dimensions.currentTop,
      scrollHeight: dimensions.previousScrollHeight,
      scrollWidth: dimensions.previousScrollWidth,
    })
  ) {
    return resolveAgentCanvasCenteredScrollPosition({
      clientHeight: dimensions.nextClientHeight,
      clientWidth: dimensions.nextClientWidth,
      scrollHeight: dimensions.nextScrollHeight,
      scrollWidth: dimensions.nextScrollWidth,
    });
  }

  return clampAgentCanvasScrollPosition({
    clientHeight: dimensions.nextClientHeight,
    clientWidth: dimensions.nextClientWidth,
    left: dimensions.currentLeft,
    scrollHeight: dimensions.nextScrollHeight,
    scrollWidth: dimensions.nextScrollWidth,
    top: dimensions.currentTop,
  });
}

export function resolveAgentCanvasViewportSyncPosition(dimensions: {
  currentLeft: number;
  currentTop: number;
  nextClientHeight: number;
  nextClientWidth: number;
  nextScrollHeight: number;
  nextScrollWidth: number;
  previousSnapshot:
    | {
        clientHeight: number;
        clientWidth: number;
        scrollHeight: number;
        scrollWidth: number;
      }
    | null
    | undefined;
  savedPosition:
    | {
        left: number;
        top: number;
      }
    | null
    | undefined;
}): {
  left: number;
  top: number;
} {
  if (!dimensions.previousSnapshot) {
    if (dimensions.savedPosition) {
      return clampAgentCanvasScrollPosition({
        clientHeight: dimensions.nextClientHeight,
        clientWidth: dimensions.nextClientWidth,
        left: dimensions.savedPosition.left,
        scrollHeight: dimensions.nextScrollHeight,
        scrollWidth: dimensions.nextScrollWidth,
        top: dimensions.savedPosition.top,
      });
    }

    return resolveAgentCanvasCenteredScrollPosition({
      clientHeight: dimensions.nextClientHeight,
      clientWidth: dimensions.nextClientWidth,
      scrollHeight: dimensions.nextScrollHeight,
      scrollWidth: dimensions.nextScrollWidth,
    });
  }

  if (
    dimensions.previousSnapshot.clientHeight === dimensions.nextClientHeight &&
    dimensions.previousSnapshot.clientWidth === dimensions.nextClientWidth &&
    dimensions.previousSnapshot.scrollHeight === dimensions.nextScrollHeight &&
    dimensions.previousSnapshot.scrollWidth === dimensions.nextScrollWidth
  ) {
    return clampAgentCanvasScrollPosition({
      clientHeight: dimensions.nextClientHeight,
      clientWidth: dimensions.nextClientWidth,
      left: dimensions.currentLeft,
      scrollHeight: dimensions.nextScrollHeight,
      scrollWidth: dimensions.nextScrollWidth,
      top: dimensions.currentTop,
    });
  }

  return resolveAgentCanvasResizeScrollPosition({
    currentLeft: dimensions.currentLeft,
    currentTop: dimensions.currentTop,
    nextClientHeight: dimensions.nextClientHeight,
    nextClientWidth: dimensions.nextClientWidth,
    nextScrollHeight: dimensions.nextScrollHeight,
    nextScrollWidth: dimensions.nextScrollWidth,
    previousClientHeight: dimensions.previousSnapshot.clientHeight,
    previousClientWidth: dimensions.previousSnapshot.clientWidth,
    previousScrollHeight: dimensions.previousSnapshot.scrollHeight,
    previousScrollWidth: dimensions.previousSnapshot.scrollWidth,
  });
}

export function resolveAgentCanvasFocusScrollPosition(dimensions: {
  clientHeight: number;
  clientWidth: number;
  currentScrollLeft: number;
  currentScrollTop: number;
  scrollHeight: number;
  scrollWidth: number;
  targetHeight: number;
  targetLeft: number;
  targetTop: number;
  targetWidth: number;
}): {
  left: number;
  top: number;
} {
  const unclampedLeft =
    dimensions.targetLeft + dimensions.targetWidth / 2 - dimensions.clientWidth / 2;
  const unclampedTop =
    dimensions.targetTop + dimensions.targetHeight / 2 - dimensions.clientHeight / 2;
  const maxLeft = Math.max(dimensions.scrollWidth - dimensions.clientWidth, 0);
  const maxTop = Math.max(dimensions.scrollHeight - dimensions.clientHeight, 0);

  return {
    left: Math.min(Math.max(unclampedLeft, 0), maxLeft),
    top: Math.min(Math.max(unclampedTop, 0), maxTop),
  };
}

export function resolveAgentCanvasFocusZoom(dimensions: {
  currentZoom: number;
  targetHeight: number;
  targetWidth: number;
  viewportHeight: number;
  viewportWidth: number;
}): number {
  const zoom = clampAgentCanvasZoom(dimensions.currentZoom);
  const targetViewportHeight = dimensions.viewportHeight * AGENT_CANVAS_FOCUS_OCCUPANCY_RATIO;
  const targetViewportWidth = dimensions.viewportWidth * AGENT_CANVAS_FOCUS_OCCUPANCY_RATIO;

  if (dimensions.targetHeight <= 0 || dimensions.targetWidth <= 0) {
    return zoom;
  }

  const scaleFactor = Math.min(
    targetViewportWidth / dimensions.targetWidth,
    targetViewportHeight / dimensions.targetHeight
  );

  if (!Number.isFinite(scaleFactor) || scaleFactor <= 1) {
    return zoom;
  }

  return clampAgentCanvasZoom(zoom * scaleFactor);
}

export function resolveAgentCanvasFloatingFrame(dimensions: {
  viewportHeight: number;
  viewportLeft: number;
  viewportTop: number;
  viewportWidth: number;
}): {
  height: number;
  left: number;
  top: number;
  width: number;
} {
  const width = dimensions.viewportWidth * AGENT_CANVAS_FOCUS_OCCUPANCY_RATIO;
  const height = dimensions.viewportHeight * AGENT_CANVAS_FOCUS_OCCUPANCY_RATIO;

  return {
    height,
    left: dimensions.viewportLeft + (dimensions.viewportWidth - width) / 2,
    top: dimensions.viewportTop + (dimensions.viewportHeight - height) / 2,
    width,
  };
}

export function resolveAgentCanvasFloatingTerminalFontScale(dimensions: {
  frameHeight: number;
  frameWidth: number;
}): number {
  if (dimensions.frameHeight <= 0 || dimensions.frameWidth <= 0) {
    return 1;
  }

  const widthScale = dimensions.frameWidth / AGENT_CANVAS_FLOATING_TERMINAL_REFERENCE_WIDTH;
  const heightScale = dimensions.frameHeight / AGENT_CANVAS_FLOATING_TERMINAL_REFERENCE_HEIGHT;
  const clampedScale = Math.min(
    AGENT_CANVAS_FLOATING_TERMINAL_FONT_SCALE_MAX,
    Math.max(AGENT_CANVAS_FLOATING_TERMINAL_FONT_SCALE_MIN, Math.min(widthScale, heightScale))
  );

  return roundAgentCanvasZoom(clampedScale);
}

export function resolveAgentCanvasZoomTerminalFontScale(value: number): number {
  const zoom = clampAgentCanvasZoom(value);
  const rawScale = 1 + Math.log2(zoom) * AGENT_CANVAS_ZOOM_TERMINAL_FONT_SCALE_LOG_FACTOR;
  const clampedScale = Math.min(
    AGENT_CANVAS_ZOOM_TERMINAL_FONT_SCALE_MAX,
    Math.max(AGENT_CANVAS_ZOOM_TERMINAL_FONT_SCALE_MIN, rawScale)
  );

  return quantizeAgentCanvasTerminalFontScale(clampedScale);
}
