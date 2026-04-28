export const AGENT_CANVAS_GRID_COLUMN_UNITS = 12;
export const AGENT_CANVAS_MAX_COLUMN_COUNT = 3;
export const AGENT_CANVAS_MIN_TILE_WIDTH = 360;
export const AGENT_CANVAS_TILE_GAP = 12;
export const AGENT_CANVAS_WORKSPACE_TILE_ROW_SIZE = 'clamp(220px, 28vh, 320px)';
export const AGENT_CANVAS_WORKSPACE_EMPTY_GROUP_HEIGHT = 96;
export const AGENT_CANVAS_WORKSPACE_COMPACT_GROUP_SPAN = 4;
export const AGENT_CANVAS_WORKSPACE_BALANCED_GROUP_SPAN = 8;

function resolveAgentCanvasSessionDensityColumnCount(sessionCount: number): number {
  if (sessionCount <= 1) {
    return 1;
  }

  if (sessionCount <= 4) {
    return 2;
  }

  return AGENT_CANVAS_MAX_COLUMN_COUNT;
}

function resolveAgentCanvasViewportColumnCapacity(viewportWidth?: number | null): number {
  if (!Number.isFinite(viewportWidth) || (viewportWidth ?? 0) <= 0) {
    return AGENT_CANVAS_MAX_COLUMN_COUNT;
  }

  const computedCapacity = Math.floor(
    ((viewportWidth ?? 0) + AGENT_CANVAS_TILE_GAP) /
      (AGENT_CANVAS_MIN_TILE_WIDTH + AGENT_CANVAS_TILE_GAP)
  );

  return Math.min(AGENT_CANVAS_MAX_COLUMN_COUNT, Math.max(1, computedCapacity));
}

export function resolveAgentCanvasColumnCount(
  sessionCount: number,
  viewportWidth?: number | null
): number {
  const densityColumnCount = resolveAgentCanvasSessionDensityColumnCount(sessionCount);
  const viewportColumnCapacity = resolveAgentCanvasViewportColumnCapacity(viewportWidth);

  return Math.min(densityColumnCount, viewportColumnCapacity);
}

export function resolveAgentCanvasWorkspaceColumnCount(
  sessionCount: number,
  viewportWidth?: number | null
): number {
  const viewportColumnCapacity = resolveAgentCanvasViewportColumnCapacity(viewportWidth);
  if (sessionCount <= 1) {
    return 1;
  }

  if (sessionCount === 3 && viewportColumnCapacity >= AGENT_CANVAS_MAX_COLUMN_COUNT) {
    return AGENT_CANVAS_MAX_COLUMN_COUNT;
  }

  return Math.min(
    resolveAgentCanvasSessionDensityColumnCount(sessionCount),
    viewportColumnCapacity
  );
}

export function resolveAgentCanvasWorkspaceGroupColumnSpan(
  sessionCount: number,
  viewportWidth?: number | null
): number {
  const viewportColumnCapacity = resolveAgentCanvasViewportColumnCapacity(viewportWidth);
  if (viewportColumnCapacity <= 1) {
    return AGENT_CANVAS_GRID_COLUMN_UNITS;
  }

  if (sessionCount <= 1) {
    return AGENT_CANVAS_WORKSPACE_COMPACT_GROUP_SPAN;
  }

  if (sessionCount >= 5) {
    return AGENT_CANVAS_GRID_COLUMN_UNITS;
  }

  const groupColumnCount = resolveAgentCanvasWorkspaceColumnCount(sessionCount, viewportWidth);
  if (groupColumnCount >= AGENT_CANVAS_MAX_COLUMN_COUNT) {
    return AGENT_CANVAS_GRID_COLUMN_UNITS;
  }

  return AGENT_CANVAS_WORKSPACE_BALANCED_GROUP_SPAN;
}

export function resolveAgentCanvasTileColumnSpan(
  sessionCount: number,
  sessionIndex: number,
  columnCount = resolveAgentCanvasColumnCount(sessionCount)
): number {
  if (sessionCount <= 0) {
    return AGENT_CANVAS_GRID_COLUMN_UNITS;
  }

  const baseSpan = AGENT_CANVAS_GRID_COLUMN_UNITS / columnCount;
  const remainder = sessionCount % columnCount;

  if (remainder === 0) {
    return baseSpan;
  }

  const lastRowStartIndex = sessionCount - remainder;
  if (sessionIndex < lastRowStartIndex) {
    return baseSpan;
  }

  return AGENT_CANVAS_GRID_COLUMN_UNITS / remainder;
}
