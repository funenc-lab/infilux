import { normalizePath, pathsEqual } from '@/App/storage';

export interface AgentCanvasActivitySessionCandidate {
  cwd: string;
  initialized?: boolean;
}

export interface AgentCanvasActivityWorktreeCandidate {
  worktreePath: string;
}

export interface AgentCanvasActivityCount {
  count: number;
  worktreePath: string;
}

export function buildAgentCanvasActivityCounts(
  sessions: AgentCanvasActivitySessionCandidate[],
  worktrees: AgentCanvasActivityWorktreeCandidate[] = []
): AgentCanvasActivityCount[] {
  const countsByWorktree = new Map<string, AgentCanvasActivityCount>();

  for (const worktree of worktrees) {
    const normalizedWorktreePath = normalizePath(worktree.worktreePath);
    if (countsByWorktree.has(normalizedWorktreePath)) {
      continue;
    }

    countsByWorktree.set(normalizedWorktreePath, {
      count: 0,
      worktreePath: worktree.worktreePath,
    });
  }

  for (const session of sessions) {
    if (!session.initialized) {
      continue;
    }

    const normalizedWorktreePath = normalizePath(session.cwd);
    const existing = countsByWorktree.get(normalizedWorktreePath);
    if (existing) {
      existing.count += 1;
      continue;
    }

    countsByWorktree.set(normalizedWorktreePath, {
      count: 1,
      worktreePath: session.cwd,
    });
  }

  return Array.from(countsByWorktree.values()).sort((left, right) =>
    normalizePath(left.worktreePath).localeCompare(normalizePath(right.worktreePath))
  );
}

export function areAgentCanvasActivityCountsEqual(
  left: AgentCanvasActivityCount[],
  right: AgentCanvasActivityCount[]
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((leftItem, index) => {
    const rightItem = right[index];
    return (
      rightItem !== undefined &&
      leftItem.count === rightItem.count &&
      pathsEqual(leftItem.worktreePath, rightItem.worktreePath)
    );
  });
}
