import { normalizePath, pathsEqual } from '@/App/storage';
import { matchesAgentSessionScope } from './agentSessionScope';

export type AgentCanvasSessionScope = 'worktree' | 'workspace';

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
  repoPath: string;
  scope: AgentCanvasSessionScope;
  sessions: TSession[];
  worktrees?: AgentCanvasWorktreeCandidate[];
}

function compareCanvasSessions<TSession extends AgentCanvasSessionCandidate>(
  left: TSession,
  right: TSession
): number {
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

export function buildAgentCanvasSessionGroupKey(repoPath: string, worktreePath: string): string {
  return `${normalizePath(repoPath)}::${normalizePath(worktreePath)}`;
}

export function resolveAgentCanvasSessionGroups<TSession extends AgentCanvasSessionCandidate>({
  currentWorktreePath,
  repoPath,
  scope,
  sessions,
  worktrees = [],
}: ResolveAgentCanvasSessionGroupsOptions<TSession>): AgentCanvasSessionGroup<TSession>[] {
  const scopedSessions = sessions.filter((session) =>
    scope === 'workspace' ? true : matchesAgentSessionScope(session, repoPath, currentWorktreePath)
  );
  const groupedByWorktree = new Map<string, AgentCanvasSessionGroup<TSession>>();

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
    }
  }

  for (const session of scopedSessions) {
    const groupKey = buildAgentCanvasSessionGroupKey(session.repoPath, session.cwd);
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
      sessions: [...group.sessions].sort(compareCanvasSessions),
    }))
    .sort((left, right) => {
      const repoDelta = normalizePath(left.repoPath).localeCompare(normalizePath(right.repoPath));
      if (repoDelta !== 0) {
        return repoDelta;
      }

      return normalizePath(left.worktreePath).localeCompare(normalizePath(right.worktreePath));
    });
}
