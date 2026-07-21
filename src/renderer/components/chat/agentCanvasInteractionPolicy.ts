export const AGENT_CANVAS_SESSION_PANEL_ATTRIBUTE = 'data-agent-canvas-session-panel';
export const AGENT_CANVAS_INTERACTIVE_SURFACE_ATTRIBUTE = 'data-agent-canvas-interactive-surface';
export const AGENT_CANVAS_SCROLL_SURFACE_ATTRIBUTE = 'data-agent-canvas-scroll-surface';

export const AGENT_CANVAS_SESSION_PANEL_SELECTOR = `[${AGENT_CANVAS_SESSION_PANEL_ATTRIBUTE}="true"]`;
export const AGENT_CANVAS_INTERACTIVE_SURFACE_SELECTOR = `[${AGENT_CANVAS_INTERACTIVE_SURFACE_ATTRIBUTE}="true"]`;
export const AGENT_CANVAS_SCROLL_SURFACE_SELECTOR = `[${AGENT_CANVAS_SCROLL_SURFACE_ATTRIBUTE}="true"]`;

type ResolveAgentCanvasPanStartOptions = {
  isCanvasDisplayMode: boolean;
  isCanvasLocked: boolean;
  pointerButton: number;
  spacePressed: boolean;
  target: EventTarget | null;
};

type ShouldBlockAgentCanvasViewportScrollOptions = {
  isCanvasDisplayMode: boolean;
  isCanvasLocked: boolean;
  target?: EventTarget | null;
};

type ShouldHandleAgentCanvasViewportZoomOptions = {
  ctrlKey: boolean;
  isCanvasDisplayMode: boolean;
  isCanvasLocked: boolean;
  metaKey: boolean;
  target?: EventTarget | null;
};

function isInsideAgentCanvasScrollSurface(target?: EventTarget | null): boolean {
  return (
    typeof Element !== 'undefined' &&
    target instanceof Element &&
    target.closest(AGENT_CANVAS_SCROLL_SURFACE_SELECTOR) !== null
  );
}

export function shouldStartAgentCanvasPan({
  isCanvasDisplayMode,
  isCanvasLocked,
  pointerButton,
  spacePressed,
  target,
}: ResolveAgentCanvasPanStartOptions): boolean {
  if (!isCanvasDisplayMode || isCanvasLocked || pointerButton !== 0) {
    return false;
  }

  if (!(target instanceof Element)) {
    return false;
  }

  if (target.closest(AGENT_CANVAS_INTERACTIVE_SURFACE_SELECTOR) !== null) {
    return false;
  }

  const startedInsideSessionPanel = target.closest(AGENT_CANVAS_SESSION_PANEL_SELECTOR) !== null;
  if (startedInsideSessionPanel && !spacePressed) {
    return false;
  }

  return true;
}

export function shouldBlockAgentCanvasViewportScroll({
  isCanvasDisplayMode,
  isCanvasLocked,
  target,
}: ShouldBlockAgentCanvasViewportScrollOptions): boolean {
  if (!isCanvasDisplayMode || !isCanvasLocked) {
    return false;
  }

  if (isInsideAgentCanvasScrollSurface(target)) {
    return false;
  }

  return true;
}

export function shouldHandleAgentCanvasViewportZoom({
  ctrlKey,
  isCanvasDisplayMode,
  isCanvasLocked,
  metaKey,
  target,
}: ShouldHandleAgentCanvasViewportZoomOptions): boolean {
  if (!isCanvasDisplayMode || isCanvasLocked || !(metaKey || ctrlKey)) {
    return false;
  }

  return !isInsideAgentCanvasScrollSurface(target);
}
