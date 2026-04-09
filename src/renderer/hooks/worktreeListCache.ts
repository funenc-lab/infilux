import type { GitWorktree } from '@shared/types';
import { sanitizeGitWorktrees } from '@/lib/worktreeData';

export interface WorktreeListRepoQuery {
  repoPath: string;
  enabled: boolean;
}

export type WorktreeListRecoveryReason = 'missing' | 'empty' | null;

interface ResolvedWorktreeListSnapshot {
  worktrees: GitWorktree[];
  recoveryReason: WorktreeListRecoveryReason;
}

export function resolveWorktreeListSnapshot(
  queryData: unknown,
  previousWorktrees: ReadonlyArray<GitWorktree> = []
): ResolvedWorktreeListSnapshot {
  const safePreviousWorktrees = sanitizeGitWorktrees(previousWorktrees);

  if (!Array.isArray(queryData)) {
    return {
      worktrees: safePreviousWorktrees,
      recoveryReason: safePreviousWorktrees.length > 0 ? 'missing' : null,
    };
  }

  const safeNextWorktrees = sanitizeGitWorktrees(queryData as GitWorktree[]);
  if (safeNextWorktrees.length === 0 && safePreviousWorktrees.length > 0) {
    return {
      worktrees: safePreviousWorktrees,
      recoveryReason: 'empty',
    };
  }

  return {
    worktrees: safeNextWorktrees,
    recoveryReason: null,
  };
}

export function buildWorktreeListMap(
  repoQueries: readonly WorktreeListRepoQuery[],
  queryData: readonly unknown[],
  previousMap: Readonly<Record<string, GitWorktree[]>> = {}
): Record<string, GitWorktree[]> {
  const map: Record<string, GitWorktree[]> = {};

  for (let index = 0; index < repoQueries.length; index += 1) {
    const repoQuery = repoQueries[index];
    if (!repoQuery?.enabled) {
      continue;
    }

    const { worktrees } = resolveWorktreeListSnapshot(
      queryData[index],
      previousMap[repoQuery.repoPath] ?? []
    );

    map[repoQuery.repoPath] = worktrees;
  }

  return map;
}
