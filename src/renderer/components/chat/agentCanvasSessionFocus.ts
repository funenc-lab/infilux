interface ResolveAgentCanvasFocusedSessionIdOptions {
  canvasSessionIds: readonly string[];
  groupActiveSessionId: string | null;
  isWorkspaceCanvasDisplayMode: boolean;
  persistedActiveSessionId: string | null;
  workspaceCanvasFocusedSessionId: string | null;
}

function containsSessionId(sessionIds: readonly string[], sessionId: string | null): boolean {
  return sessionId !== null && sessionIds.includes(sessionId);
}

export function resolveAgentCanvasFocusedSessionId({
  canvasSessionIds,
  groupActiveSessionId,
  isWorkspaceCanvasDisplayMode,
  persistedActiveSessionId,
  workspaceCanvasFocusedSessionId,
}: ResolveAgentCanvasFocusedSessionIdOptions): string | null {
  if (canvasSessionIds.length === 0) {
    return null;
  }

  if (isWorkspaceCanvasDisplayMode) {
    if (containsSessionId(canvasSessionIds, workspaceCanvasFocusedSessionId)) {
      return workspaceCanvasFocusedSessionId;
    }

    return null;
  }

  if (containsSessionId(canvasSessionIds, persistedActiveSessionId)) {
    return persistedActiveSessionId;
  }

  if (containsSessionId(canvasSessionIds, groupActiveSessionId)) {
    return groupActiveSessionId;
  }

  return canvasSessionIds[0] ?? null;
}
