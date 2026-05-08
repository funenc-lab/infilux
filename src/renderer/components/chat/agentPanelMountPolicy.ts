import { normalizePath } from '@/App/storage';
import { matchesAgentSessionScope } from './agentSessionScope';
import { getSessionActivityStatePriority, type SessionActivityState } from './sessionActivityState';

export const DEFAULT_WORKSPACE_CANVAS_TERMINAL_MOUNT_LIMIT = 12;
export const DEFAULT_WORKTREE_TERMINAL_MOUNT_LIMIT = 6;

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
  recovered?: boolean;
  recoveryState?: string;
}

interface ResolveMountedAgentPanelSessionIdsOptions<
  TSession extends MountedAgentPanelSessionCandidate,
> {
  canvasFloatingSessionId?: string | null;
  canvasFocusedSessionId?: string | null;
  canvasSessions: TSession[];
  currentWorktreeSessions: TSession[];
  currentWorktreeVisibleSessionIds?: Iterable<string>;
  globalSessionIds: Iterable<string>;
  isWorkspaceCanvasDisplayMode?: boolean;
  sessionActivityStateById?: Record<string, SessionActivityState>;
  suppressSessionMounting?: boolean;
  worktreeTerminalMountLimit?: number;
  workspaceCanvasTerminalMountLimit?: number;
}

function normalizeWorkspaceCanvasTerminalMountLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_WORKSPACE_CANVAS_TERMINAL_MOUNT_LIMIT;
  }
  return Math.max(0, Math.floor(limit ?? DEFAULT_WORKSPACE_CANVAS_TERMINAL_MOUNT_LIMIT));
}

function normalizeWorktreeTerminalMountLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_WORKTREE_TERMINAL_MOUNT_LIMIT;
  }
  return Math.max(0, Math.floor(limit ?? DEFAULT_WORKTREE_TERMINAL_MOUNT_LIMIT));
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

function requiresRecoveryMount(session: MountedAgentPanelSessionCandidate): boolean {
  return session.recovered === true && session.recoveryState !== 'missing-host-session';
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

  const recoverySessions = rankedSessions
    .filter(
      (item) => requiresRecoveryMount(item.session) && !selectedSessionIds.has(item.session.id)
    )
    .sort(compareStableMountOrder);

  for (const item of recoverySessions) {
    if (!hasMountBudget(selectedSessionIds, limit)) {
      break;
    }
    selectedSessionIds.add(item.session.id);
  }

  const idleSessions = rankedSessions
    .filter(
      (item) =>
        item.priority === 0 &&
        !requiresRecoveryMount(item.session) &&
        !selectedSessionIds.has(item.session.id)
    )
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

function resolveWorktreeMountedSessionIds<TSession extends MountedAgentPanelSessionCandidate>({
  currentWorktreeSessions,
  currentWorktreeVisibleSessionIds,
  globalSessionIds,
  sessionActivityStateById = {},
  worktreeTerminalMountLimit,
}: Pick<
  ResolveMountedAgentPanelSessionIdsOptions<TSession>,
  | 'currentWorktreeSessions'
  | 'currentWorktreeVisibleSessionIds'
  | 'globalSessionIds'
  | 'sessionActivityStateById'
  | 'worktreeTerminalMountLimit'
>): string[] {
  const orderedIds = currentWorktreeSessions.map((session) => session.id);
  const seen = new Set(orderedIds);

  for (const sessionId of globalSessionIds) {
    if (!seen.has(sessionId)) {
      orderedIds.push(sessionId);
      seen.add(sessionId);
    }
  }

  const limit = normalizeWorktreeTerminalMountLimit(worktreeTerminalMountLimit);
  if (orderedIds.length <= limit) {
    return orderedIds;
  }

  const currentWorktreeSessionIdSet = new Set(currentWorktreeSessions.map((session) => session.id));
  const visibleSessionIds = new Set<string>();

  for (const sessionId of currentWorktreeVisibleSessionIds ?? orderedIds) {
    if (currentWorktreeSessionIdSet.has(sessionId)) {
      visibleSessionIds.add(sessionId);
    }
  }

  const selectedSessionIds = new Set<string>(visibleSessionIds);

  const rankedSessions = currentWorktreeSessions.map((session, index) => ({
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

  return orderedIds.filter((sessionId) => selectedSessionIds.has(sessionId));
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
  currentWorktreeVisibleSessionIds,
  globalSessionIds,
  isWorkspaceCanvasDisplayMode,
  sessionActivityStateById,
  suppressSessionMounting,
  worktreeTerminalMountLimit,
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

  return resolveWorktreeMountedSessionIds({
    currentWorktreeSessions,
    currentWorktreeVisibleSessionIds,
    globalSessionIds,
    sessionActivityStateById,
    worktreeTerminalMountLimit,
  });
}
