export const AGENT_CANVAS_GRID_COLUMN_UNITS = 12;

export function resolveAgentCanvasColumnCount(sessionCount: number): number {
  if (sessionCount <= 1) {
    return 1;
  }

  if (sessionCount <= 4) {
    return 2;
  }

  return 3;
}

export function resolveAgentCanvasTileColumnSpan(
  sessionCount: number,
  sessionIndex: number
): number {
  if (sessionCount <= 0) {
    return AGENT_CANVAS_GRID_COLUMN_UNITS;
  }

  const columnCount = resolveAgentCanvasColumnCount(sessionCount);
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
