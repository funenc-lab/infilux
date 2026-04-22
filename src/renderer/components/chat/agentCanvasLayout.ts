export const AGENT_CANVAS_GRID_COLUMN_UNITS = 12;
export const AGENT_CANVAS_MAX_COLUMN_COUNT = 3;
export const AGENT_CANVAS_MIN_TILE_WIDTH = 360;
export const AGENT_CANVAS_TILE_GAP = 12;

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
