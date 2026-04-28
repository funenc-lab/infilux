import { matchesAgentSessionScope } from './agentSessionScope';

interface SessionMountCandidate {
  id: string;
  repoPath: string;
  cwd: string;
}

interface MountedAgentPanelSessionCandidate {
  id: string;
}

interface ResolveMountedAgentPanelSessionIdsOptions<
  TSession extends MountedAgentPanelSessionCandidate,
> {
  canvasSessions: TSession[];
  currentWorktreeSessions: TSession[];
  globalSessionIds: Iterable<string>;
  isWorkspaceCanvasDisplayMode?: boolean;
  suppressSessionMounting?: boolean;
}

export function collectMountedAgentSessionIds(
  sessions: SessionMountCandidate[],
  repoPath: string,
  cwd: string
): string[] {
  return sessions
    .filter((session) => matchesAgentSessionScope(session, repoPath, cwd))
    .map((session) => session.id);
}

export function resolveMountedAgentPanelSessionIds<
  TSession extends MountedAgentPanelSessionCandidate,
>({
  canvasSessions,
  currentWorktreeSessions,
  globalSessionIds,
  isWorkspaceCanvasDisplayMode,
  suppressSessionMounting,
}: ResolveMountedAgentPanelSessionIdsOptions<TSession>): string[] {
  if (suppressSessionMounting) {
    return [];
  }

  if (isWorkspaceCanvasDisplayMode) {
    return canvasSessions.map((session) => session.id);
  }

  const orderedIds = currentWorktreeSessions.map((session) => session.id);
  const seen = new Set(orderedIds);

  for (const sessionId of globalSessionIds) {
    if (!seen.has(sessionId)) {
      orderedIds.push(sessionId);
    }
  }

  return orderedIds;
}
