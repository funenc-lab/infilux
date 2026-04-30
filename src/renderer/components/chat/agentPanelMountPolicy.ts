import { normalizePath } from '@/App/storage';
import { matchesAgentSessionScope } from './agentSessionScope';
import { getSessionActivityStatePriority, type SessionActivityState } from './sessionActivityState';

export const DEFAULT_WORKSPACE_CANVAS_TERMINAL_MOUNT_LIMIT = 12;

interface SessionMountCandidate {
  id: string;
  repoPath: string;
  cwd: string;
}

interface MountedAgentPanelSessionCandidate {
  createdAt?: number;
  cwd?: string;
  displayOrder?: number;
  id: string;
  repoPath?: string;
}

interface ResolveMountedAgentPanelSessionIdsOptions<
  TSession extends MountedAgentPanelSessionCandidate,
> {
  canvasFloatingSessionId?: string | null;
  canvasFocusedSessionId?: string | null;
  canvasSessions: TSession[];
  currentWorktreeSessions: TSession[];
  globalSessionIds: Iterable<string>;
  isWorkspaceCanvasDisplayMode?: boolean;
  sessionActivityStateById?: Record<string, SessionActivityState>;
  suppressSessionMounting?: boolean;
  workspaceCanvasTerminalMountLimit?: number;
}

function normalizeWorkspaceCanvasTerminalMountLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_WORKSPACE_CANVAS_TERMINAL_MOUNT_LIMIT;
  }
  return Math.max(0, Math.floor(limit ?? DEFAULT_WORKSPACE_CANVAS_TERMINAL_MOUNT_LIMIT));
}

function addSessionId(
  set: Set<string>,
  sessionId: string | null | undefined,
  validSessionIds: Set<string>
): void {
  if (sessionId && validSessionIds.has(sessionId)) {
    set.add(sessionId);
  }
}

function hasMountBudget(selectedSessionIds: Set<string>, limit: number): boolean {
  return selectedSessionIds.size < limit;
}

function compareOptionalPath(left: string | undefined, right: string | undefined): number {
  if (left && right) {
    return normalizePath(left).localeCompare(normalizePath(right));
  }

  if (left) {
    return -1;
  }

  if (right) {
    return 1;
  }

  return 0;
}

function compareOptionalNumber(left: number | undefined, right: number | undefined): number {
  if (Number.isFinite(left) && Number.isFinite(right)) {
    return Number(left) - Number(right);
  }

  if (Number.isFinite(left)) {
    return -1;
  }

  if (Number.isFinite(right)) {
    return 1;
  }

  return 0;
}

function compareStableMountOrder<TSession extends MountedAgentPanelSessionCandidate>(
  left: { index: number; session: TSession },
  right: { index: number; session: TSession }
): number {
  const repoDelta = compareOptionalPath(left.session.repoPath, right.session.repoPath);
  if (repoDelta !== 0) {
    return repoDelta;
  }

  const cwdDelta = compareOptionalPath(left.session.cwd, right.session.cwd);
  if (cwdDelta !== 0) {
    return cwdDelta;
  }

  const displayOrderDelta = compareOptionalNumber(
    left.session.displayOrder,
    right.session.displayOrder
  );
  if (displayOrderDelta !== 0) {
    return displayOrderDelta;
  }

  const createdAtDelta = compareOptionalNumber(left.session.createdAt, right.session.createdAt);
  if (createdAtDelta !== 0) {
    return createdAtDelta;
  }

  const idDelta = left.session.id.localeCompare(right.session.id);
  return idDelta !== 0 ? idDelta : left.index - right.index;
}

function resolveWorkspaceCanvasMountedSessionIds<
  TSession extends MountedAgentPanelSessionCandidate,
>({
  canvasFloatingSessionId,
  canvasFocusedSessionId,
  canvasSessions,
  sessionActivityStateById = {},
  workspaceCanvasTerminalMountLimit,
}: Pick<
  ResolveMountedAgentPanelSessionIdsOptions<TSession>,
  | 'canvasFloatingSessionId'
  | 'canvasFocusedSessionId'
  | 'canvasSessions'
  | 'sessionActivityStateById'
  | 'workspaceCanvasTerminalMountLimit'
>): string[] {
  const limit = normalizeWorkspaceCanvasTerminalMountLimit(workspaceCanvasTerminalMountLimit);
  if (canvasSessions.length <= limit) {
    return canvasSessions.map((session) => session.id);
  }

  const validSessionIds = new Set(canvasSessions.map((session) => session.id));
  const selectedSessionIds = new Set<string>();
  addSessionId(selectedSessionIds, canvasFocusedSessionId, validSessionIds);
  addSessionId(selectedSessionIds, canvasFloatingSessionId, validSessionIds);

  const rankedSessions = canvasSessions.map((session, index) => ({
    index,
    priority: getSessionActivityStatePriority(sessionActivityStateById[session.id] ?? 'idle'),
    session,
  }));

  const attentionSessions = rankedSessions
    .filter((item) => item.priority > 0 && !selectedSessionIds.has(item.session.id))
    .sort((left, right) => {
      const priorityDelta = right.priority - left.priority;
      return priorityDelta !== 0 ? priorityDelta : compareStableMountOrder(left, right);
    });

  for (const item of attentionSessions) {
    if (!hasMountBudget(selectedSessionIds, limit)) {
      break;
    }
    selectedSessionIds.add(item.session.id);
  }

  const idleSessions = rankedSessions
    .filter((item) => item.priority === 0 && !selectedSessionIds.has(item.session.id))
    .sort(compareStableMountOrder);

  for (const item of idleSessions) {
    if (!hasMountBudget(selectedSessionIds, limit)) {
      break;
    }
    selectedSessionIds.add(item.session.id);
  }

  return canvasSessions
    .filter((session) => selectedSessionIds.has(session.id))
    .map((session) => session.id);
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
  canvasFloatingSessionId,
  canvasFocusedSessionId,
  currentWorktreeSessions,
  globalSessionIds,
  isWorkspaceCanvasDisplayMode,
  sessionActivityStateById,
  suppressSessionMounting,
  workspaceCanvasTerminalMountLimit,
}: ResolveMountedAgentPanelSessionIdsOptions<TSession>): string[] {
  if (suppressSessionMounting) {
    return [];
  }

  if (isWorkspaceCanvasDisplayMode) {
    return resolveWorkspaceCanvasMountedSessionIds({
      canvasFloatingSessionId,
      canvasFocusedSessionId,
      canvasSessions,
      sessionActivityStateById,
      workspaceCanvasTerminalMountLimit,
    });
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
