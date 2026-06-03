import { normalizePath, pathsEqual } from '@/App/storage';
import { matchesAgentSessionScope } from './agentSessionScope';
import { getSessionActivityStatePriority, type SessionActivityState } from './sessionActivityState';

export type AgentCanvasSessionScope = 'worktree' | 'workspace';
export type AgentCanvasSessionOrderingMode = 'stable' | 'activity';

export interface AgentCanvasSessionCandidate {
  id: string;
  repoPath: string;
  cwd: string;
  createdAt?: number;
  displayOrder?: number;
}

export interface AgentCanvasWorktreeCandidate {
  repoPath: string;
  worktreePath: string;
}

export interface AgentCanvasSessionGroup<TSession extends AgentCanvasSessionCandidate> {
  groupKey: string;
  isCurrentWorktree: boolean;
  repoPath: string;
  sessions: TSession[];
  worktreePath: string;
}

interface ResolveAgentCanvasSessionGroupsOptions<TSession extends AgentCanvasSessionCandidate> {
  currentWorktreePath: string;
  orderingMode?: AgentCanvasSessionOrderingMode;
  repoPath: string;
  scope: AgentCanvasSessionScope;
  sessions: TSession[];
  sessionActivityStateById?: Record<string, SessionActivityState>;
  sessionLastActivityAtById?: Record<string, number>;
  worktrees?: AgentCanvasWorktreeCandidate[];
}

function compareCanvasSessions<TSession extends AgentCanvasSessionCandidate>(
  left: TSession,
  right: TSession,
  sessionActivityStateById?: Record<string, SessionActivityState>,
  sessionLastActivityAtById?: Record<string, number>
): number {
  if (sessionActivityStateById) {
    const activityDelta =
      getSessionActivityStatePriority(sessionActivityStateById[right.id] ?? 'idle') -
      getSessionActivityStatePriority(sessionActivityStateById[left.id] ?? 'idle');
    if (activityDelta !== 0) {
      return activityDelta;
    }
  }

  if (sessionLastActivityAtById) {
    const lastActivityDelta =
      (sessionLastActivityAtById[right.id] ?? 0) - (sessionLastActivityAtById[left.id] ?? 0);
    if (lastActivityDelta !== 0) {
      return lastActivityDelta;
    }
  }

  const orderDelta = (left.displayOrder ?? 0) - (right.displayOrder ?? 0);
  if (orderDelta !== 0) {
    return orderDelta;
  }

  const createdAtDelta = (left.createdAt ?? 0) - (right.createdAt ?? 0);
  if (createdAtDelta !== 0) {
    return createdAtDelta;
  }

  return left.id.localeCompare(right.id);
}

function getCanvasSessionGroupActivityPriority<TSession extends AgentCanvasSessionCandidate>(
  group: AgentCanvasSessionGroup<TSession>,
  sessionActivityStateById?: Record<string, SessionActivityState>
): number {
  if (!sessionActivityStateById) {
    return 0;
  }

  let highestPriority = 0;
  for (const session of group.sessions) {
    highestPriority = Math.max(
      highestPriority,
      getSessionActivityStatePriority(sessionActivityStateById[session.id] ?? 'idle')
    );
  }
  return highestPriority;
}

function getCanvasSessionGroupLastActivityAt<TSession extends AgentCanvasSessionCandidate>(
  group: AgentCanvasSessionGroup<TSession>,
  sessionLastActivityAtById?: Record<string, number>
): number {
  if (!sessionLastActivityAtById) {
    return 0;
  }

  let latestActivityAt = 0;
  for (const session of group.sessions) {
    latestActivityAt = Math.max(latestActivityAt, sessionLastActivityAtById[session.id] ?? 0);
  }
  return latestActivityAt;
}

export function buildAgentCanvasSessionGroupKey(repoPath: string, worktreePath: string): string {
  return `${normalizePath(repoPath)}::${normalizePath(worktreePath)}`;
}

export function resolveAgentCanvasSessionGroups<TSession extends AgentCanvasSessionCandidate>({
  currentWorktreePath,
  orderingMode = 'stable',
  repoPath,
  scope,
  sessions,
  sessionActivityStateById,
  sessionLastActivityAtById,
  worktrees = [],
}: ResolveAgentCanvasSessionGroupsOptions<TSession>): AgentCanvasSessionGroup<TSession>[] {
  const isSmartWorkspaceOrderingEnabled =
    scope === 'workspace' &&
    orderingMode === 'activity' &&
    Boolean(sessionActivityStateById || sessionLastActivityAtById);
  const canvasSessionActivityStateById = isSmartWorkspaceOrderingEnabled
    ? sessionActivityStateById
    : undefined;
  const canvasSessionLastActivityAtById = isSmartWorkspaceOrderingEnabled
    ? sessionLastActivityAtById
    : undefined;
  const scopedSessions = sessions.filter((session) =>
    scope === 'workspace' ? true : matchesAgentSessionScope(session, repoPath, currentWorktreePath)
  );
  const groupedByWorktree = new Map<string, AgentCanvasSessionGroup<TSession>>();
  const workspaceGroupKeys = new Set<string>();

  if (scope === 'workspace') {
    for (const worktree of worktrees) {
      const groupKey = buildAgentCanvasSessionGroupKey(worktree.repoPath, worktree.worktreePath);
      if (groupedByWorktree.has(groupKey)) {
        continue;
      }

      groupedByWorktree.set(groupKey, {
        groupKey,
        isCurrentWorktree:
          pathsEqual(worktree.repoPath, repoPath) &&
          pathsEqual(worktree.worktreePath, currentWorktreePath),
        repoPath: worktree.repoPath,
        sessions: [],
        worktreePath: worktree.worktreePath,
      });
      workspaceGroupKeys.add(groupKey);
    }
  }

  for (const session of scopedSessions) {
    const groupKey = buildAgentCanvasSessionGroupKey(session.repoPath, session.cwd);
    if (scope === 'workspace' && worktrees.length > 0 && !workspaceGroupKeys.has(groupKey)) {
      continue;
    }

    const currentGroup = groupedByWorktree.get(groupKey);
    if (currentGroup) {
      currentGroup.sessions.push(session);
      continue;
    }

    groupedByWorktree.set(groupKey, {
      groupKey,
      isCurrentWorktree:
        pathsEqual(session.repoPath, repoPath) && pathsEqual(session.cwd, currentWorktreePath),
      repoPath: session.repoPath,
      sessions: [session],
      worktreePath: session.cwd,
    });
  }

  return Array.from(groupedByWorktree.values())
    .map((group) => ({
      ...group,
      sessions: [...group.sessions].sort((left, right) =>
        compareCanvasSessions(
          left,
          right,
          canvasSessionActivityStateById,
          canvasSessionLastActivityAtById
        )
      ),
    }))
    .sort((left, right) => {
      const activityDelta =
        getCanvasSessionGroupActivityPriority(right, canvasSessionActivityStateById) -
        getCanvasSessionGroupActivityPriority(left, canvasSessionActivityStateById);
      if (activityDelta !== 0) {
        return activityDelta;
      }

      const lastActivityDelta =
        getCanvasSessionGroupLastActivityAt(right, canvasSessionLastActivityAtById) -
        getCanvasSessionGroupLastActivityAt(left, canvasSessionLastActivityAtById);
      if (lastActivityDelta !== 0) {
        return lastActivityDelta;
      }

      const repoDelta = normalizePath(left.repoPath).localeCompare(normalizePath(right.repoPath));
      if (repoDelta !== 0) {
        return repoDelta;
      }

      return normalizePath(left.worktreePath).localeCompare(normalizePath(right.worktreePath));
    });
}
