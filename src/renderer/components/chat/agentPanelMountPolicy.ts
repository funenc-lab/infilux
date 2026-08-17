import { supportsProviderSessionResume } from '@shared/utils/agentInputMode';
import { normalizePath } from '@/App/storage';
import {
  AGENT_BACKGROUND_RUNTIME_DORMANT_THRESHOLD_MS,
  shouldDeferBackgroundAgentRuntimeMount,
} from './agentSessionRuntimeSafetyPolicy';
import { matchesAgentSessionScope } from './agentSessionScope';
import { getSessionActivityStatePriority, type SessionActivityState } from './sessionActivityState';

export { AGENT_BACKGROUND_RUNTIME_DORMANT_THRESHOLD_MS };

export const DEFAULT_WORKSPACE_CANVAS_TERMINAL_MOUNT_LIMIT = 12;
export const DEFAULT_WORKTREE_TERMINAL_MOUNT_LIMIT = 6;

interface SessionMountCandidate {
  id: string;
  repoPath: string;
  cwd: string;
}

interface MountedAgentPanelSessionCandidate {
  agentCommand?: string;
  agentId?: string;
  createdAt?: number;
  cwd?: string;
  displayOrder?: number;
  id: string;
  pendingCommand?: string;
  providerSessionIdentityValid?: boolean;
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
  foregroundSessionIds?: Iterable<string>;
  globalSessionIds: Iterable<string>;
  isCanvasDisplayMode?: boolean;
  isWorkspaceCanvasDisplayMode?: boolean;
  sessionActivityStateById?: Record<string, SessionActivityState>;
  sessionLastActivityAtById?: Record<string, number | undefined>;
  suppressSessionMounting?: boolean;
  worktreeTerminalMountLimit?: number;
  workspaceCanvasTerminalMountLimit?: number;
  now?: number;
}

interface ResolveBackgroundAgentCanvasMountSessionIdsOptions {
  backgroundMountedSessionIds: Iterable<string>;
  batchSize: number;
  canvasSessionIds: string[];
  maxMountedSessionCount: number;
  mountedSessionIds: Iterable<string>;
  shouldDeferSessionMount?: (sessionId: string) => boolean;
  userRequestedSessionIds?: Iterable<string>;
}

interface ResolvedBackgroundAgentCanvasMountPlan {
  hasMore: boolean;
  sessionIds: string[];
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

function isRuntimeMountableCanvasSession(session: MountedAgentPanelSessionCandidate): boolean {
  if (session.recoveryState !== 'missing-host-session') {
    return true;
  }

  return Boolean(
    session.recovered &&
      session.providerSessionIdentityValid &&
      session.agentCommand &&
      supportsProviderSessionResume(session.agentCommand)
  );
}

function requiresImmediateRuntimeMount(session: MountedAgentPanelSessionCandidate): boolean {
  return Boolean(session.pendingCommand);
}

function shouldDeferPassiveRuntimeMount<TSession extends MountedAgentPanelSessionCandidate>(
  session: TSession,
  options: {
    focusedSessionId?: string | null;
    now?: number;
    sessionActivityStateById: Record<string, SessionActivityState>;
    sessionLastActivityAtById: Record<string, number | undefined>;
  }
): boolean {
  return shouldDeferBackgroundAgentRuntimeMount({
    agentCommand: session.agentCommand,
    agentId: session.agentId,
    createdAt: session.createdAt,
    hasPendingCommand: Boolean(session.pendingCommand),
    isFocused: options.focusedSessionId === session.id,
    lastActivityAt: options.sessionLastActivityAtById[session.id],
    now: options.now,
    recovered: session.recovered,
    recoveryState: session.recoveryState,
    sessionActivityState: options.sessionActivityStateById[session.id] ?? 'idle',
  });
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

function normalizeBackgroundMountLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return 0;
  }

  return Math.max(0, Math.floor(limit));
}

function normalizeBackgroundMountBatchSize(batchSize: number): number {
  if (!Number.isFinite(batchSize)) {
    return 0;
  }

  return Math.max(0, Math.floor(batchSize));
}

function collectValidSessionIds(ids: Iterable<string>, validSessionIds: Set<string>): Set<string> {
  const collectedIds = new Set<string>();

  for (const sessionId of ids) {
    if (validSessionIds.has(sessionId)) {
      collectedIds.add(sessionId);
    }
  }

  return collectedIds;
}

function areSessionIdSetsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size !== right.size) {
    return false;
  }

  for (const sessionId of left) {
    if (!right.has(sessionId)) {
      return false;
    }
  }

  return true;
}

export function reconcileMountedAgentPanelSessionIdSet(
  currentSessionIds: ReadonlySet<string>,
  mountedSessionIds: Iterable<string>
): Set<string> {
  const nextSessionIds = new Set(mountedSessionIds);
  return areSessionIdSetsEqual(currentSessionIds, nextSessionIds)
    ? (currentSessionIds as Set<string>)
    : nextSessionIds;
}

function isEligibleBackgroundMountSession({
  baseMountedSessionIds,
  sessionId,
  shouldDeferSessionMount,
}: {
  baseMountedSessionIds: Set<string>;
  sessionId: string;
  shouldDeferSessionMount?: (sessionId: string) => boolean;
}): boolean {
  return !baseMountedSessionIds.has(sessionId) && !(shouldDeferSessionMount?.(sessionId) ?? false);
}

export function resolveBackgroundAgentCanvasMountPlan({
  backgroundMountedSessionIds,
  batchSize,
  canvasSessionIds,
  maxMountedSessionCount,
  mountedSessionIds,
  shouldDeferSessionMount,
  userRequestedSessionIds = [],
}: ResolveBackgroundAgentCanvasMountSessionIdsOptions): ResolvedBackgroundAgentCanvasMountPlan {
  const validSessionIds = new Set(canvasSessionIds);
  const baseMountedSessionIds = collectValidSessionIds(mountedSessionIds, validSessionIds);
  for (const sessionId of collectValidSessionIds(userRequestedSessionIds, validSessionIds)) {
    baseMountedSessionIds.add(sessionId);
  }

  const remainingBudget = Math.max(
    0,
    normalizeBackgroundMountLimit(maxMountedSessionCount) - baseMountedSessionIds.size
  );
  if (remainingBudget === 0) {
    return {
      hasMore: false,
      sessionIds: [],
    };
  }

  const currentBackgroundSessionIds = collectValidSessionIds(
    backgroundMountedSessionIds,
    validSessionIds
  );
  const nextSessionIds: string[] = [];
  let totalEligibleSessionCount = 0;

  for (const sessionId of canvasSessionIds) {
    if (
      isEligibleBackgroundMountSession({
        baseMountedSessionIds,
        sessionId,
        shouldDeferSessionMount,
      })
    ) {
      totalEligibleSessionCount += 1;
    }

    if (nextSessionIds.length >= remainingBudget) {
      break;
    }

    if (
      currentBackgroundSessionIds.has(sessionId) &&
      isEligibleBackgroundMountSession({
        baseMountedSessionIds,
        sessionId,
        shouldDeferSessionMount,
      })
    ) {
      nextSessionIds.push(sessionId);
    }
  }

  const additionalMountCount = Math.min(
    normalizeBackgroundMountBatchSize(batchSize),
    remainingBudget - nextSessionIds.length
  );
  if (additionalMountCount <= 0) {
    return {
      hasMore: false,
      sessionIds: nextSessionIds,
    };
  }

  const nextSessionIdSet = new Set(nextSessionIds);
  const preservedSessionCount = nextSessionIds.length;
  for (const sessionId of canvasSessionIds) {
    if (nextSessionIds.length >= remainingBudget) {
      break;
    }

    if (nextSessionIds.length >= preservedSessionCount + additionalMountCount) {
      break;
    }

    if (
      !nextSessionIdSet.has(sessionId) &&
      isEligibleBackgroundMountSession({
        baseMountedSessionIds,
        sessionId,
        shouldDeferSessionMount,
      })
    ) {
      nextSessionIdSet.add(sessionId);
      nextSessionIds.push(sessionId);
    }
  }

  return {
    hasMore:
      nextSessionIds.length < remainingBudget && totalEligibleSessionCount > nextSessionIds.length,
    sessionIds: nextSessionIds,
  };
}

export function resolveBackgroundAgentCanvasMountSessionIds(
  options: ResolveBackgroundAgentCanvasMountSessionIdsOptions
): string[] {
  return resolveBackgroundAgentCanvasMountPlan(options).sessionIds;
}

function resolveWorkspaceCanvasMountedSessionIds<
  TSession extends MountedAgentPanelSessionCandidate,
>({
  canvasFloatingSessionId,
  canvasFocusedSessionId,
  canvasSessions,
  foregroundSessionIds = [],
  now,
  sessionActivityStateById = {},
  sessionLastActivityAtById = {},
  workspaceCanvasTerminalMountLimit,
}: Pick<
  ResolveMountedAgentPanelSessionIdsOptions<TSession>,
  | 'canvasFloatingSessionId'
  | 'canvasFocusedSessionId'
  | 'canvasSessions'
  | 'foregroundSessionIds'
  | 'now'
  | 'sessionActivityStateById'
  | 'sessionLastActivityAtById'
  | 'workspaceCanvasTerminalMountLimit'
>): string[] {
  const limit = normalizeWorkspaceCanvasTerminalMountLimit(workspaceCanvasTerminalMountLimit);
  const mountableCanvasSessions = canvasSessions.filter(isRuntimeMountableCanvasSession);
  if (mountableCanvasSessions.length <= limit) {
    return mountableCanvasSessions.map((session) => session.id);
  }

  const validSessionIds = new Set(mountableCanvasSessions.map((session) => session.id));
  const selectedSessionIds = new Set<string>();
  addSessionId(selectedSessionIds, canvasFocusedSessionId, validSessionIds);
  addSessionId(selectedSessionIds, canvasFloatingSessionId, validSessionIds);
  for (const sessionId of foregroundSessionIds) {
    if (!hasMountBudget(selectedSessionIds, limit)) {
      break;
    }
    addSessionId(selectedSessionIds, sessionId, validSessionIds);
  }

  const rankedSessions = mountableCanvasSessions.map((session, index) => ({
    index,
    priority: getSessionActivityStatePriority(sessionActivityStateById[session.id] ?? 'idle'),
    session,
  }));

  const pendingSessions = rankedSessions
    .filter(
      (item) =>
        requiresImmediateRuntimeMount(item.session) && !selectedSessionIds.has(item.session.id)
    )
    .sort(compareStableMountOrder);

  for (const item of pendingSessions) {
    if (!hasMountBudget(selectedSessionIds, limit)) {
      break;
    }
    selectedSessionIds.add(item.session.id);
  }

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
      (item) =>
        requiresRecoveryMount(item.session) &&
        !selectedSessionIds.has(item.session.id) &&
        !shouldDeferPassiveRuntimeMount(item.session, {
          focusedSessionId: canvasFocusedSessionId,
          now,
          sessionActivityStateById,
          sessionLastActivityAtById,
        })
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
        !selectedSessionIds.has(item.session.id) &&
        !shouldDeferPassiveRuntimeMount(item.session, {
          focusedSessionId: canvasFocusedSessionId,
          now,
          sessionActivityStateById,
          sessionLastActivityAtById,
        })
    )
    .sort(compareStableMountOrder);

  for (const item of idleSessions) {
    if (!hasMountBudget(selectedSessionIds, limit)) {
      break;
    }
    selectedSessionIds.add(item.session.id);
  }

  return mountableCanvasSessions
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

  const pendingSessions = rankedSessions
    .filter(
      (item) =>
        requiresImmediateRuntimeMount(item.session) && !selectedSessionIds.has(item.session.id)
    )
    .sort(compareStableMountOrder);

  for (const item of pendingSessions) {
    if (!hasMountBudget(selectedSessionIds, limit)) {
      break;
    }
    selectedSessionIds.add(item.session.id);
  }

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
  foregroundSessionIds,
  globalSessionIds,
  isCanvasDisplayMode,
  isWorkspaceCanvasDisplayMode,
  now,
  sessionActivityStateById,
  sessionLastActivityAtById,
  suppressSessionMounting,
  worktreeTerminalMountLimit,
  workspaceCanvasTerminalMountLimit,
}: ResolveMountedAgentPanelSessionIdsOptions<TSession>): string[] {
  if (suppressSessionMounting) {
    return [];
  }

  if (isCanvasDisplayMode || isWorkspaceCanvasDisplayMode) {
    const canvasTerminalMountLimit = isWorkspaceCanvasDisplayMode
      ? workspaceCanvasTerminalMountLimit
      : worktreeTerminalMountLimit;

    return resolveWorkspaceCanvasMountedSessionIds({
      canvasFloatingSessionId,
      canvasFocusedSessionId,
      canvasSessions,
      foregroundSessionIds,
      now,
      sessionActivityStateById,
      sessionLastActivityAtById,
      workspaceCanvasTerminalMountLimit: canvasTerminalMountLimit,
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
