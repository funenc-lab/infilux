export function resolveAgentCanvasColumnCount(sessionCount: number): number {
  if (sessionCount <= 1) {
    return 1;
  }

  if (sessionCount <= 4) {
    return 2;
  }

  return 3;
}
