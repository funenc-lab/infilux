import type { GitWorktree } from '@shared/types';
import { sanitizeGitWorktrees } from '@/lib/worktreeData';

export interface WorktreeListRepoQuery {
  repoPath: string;
  enabled: boolean;
}

export function buildWorktreeListMap(
  repoQueries: readonly WorktreeListRepoQuery[],
  queryData: readonly unknown[]
): Record<string, GitWorktree[]> {
  const map: Record<string, GitWorktree[]> = {};

  for (let index = 0; index < repoQueries.length; index += 1) {
    const repoQuery = repoQueries[index];
    if (!repoQuery?.enabled) {
      continue;
    }

    const worktrees = sanitizeGitWorktrees(
      Array.isArray(queryData[index]) ? (queryData[index] as GitWorktree[]) : []
    );

    map[repoQuery.repoPath] = worktrees;
  }

  return map;
}
