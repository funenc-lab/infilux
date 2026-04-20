import type { GitWorktree, TempWorkspaceItem } from '@shared/types';
import { sanitizeGitWorktrees } from '@/lib/worktreeData';
import { type Repository, TEMP_REPO_ID } from './constants';
import { pathsEqual } from './storage';

interface SwitchWorktreeByPathOptions {
  worktreePath: string;
  tempWorkspaces: Pick<TempWorkspaceItem, 'path'>[];
  visibleWorktrees: GitWorktree[];
  repositories: Pick<Repository, 'path' | 'kind' | 'connectionId' | 'id' | 'name'>[];
  canLoadRepo: (repoPath: string) => boolean;
  isRemoteRepoPath: (repoPath: string) => boolean;
  listWorktrees: (repoPath: string) => Promise<GitWorktree[]>;
  selectWorktree: (worktree: GitWorktree, nextRepoPath?: string) => Promise<void> | void;
}

export async function switchWorktreeByPath({
  worktreePath,
  tempWorkspaces,
  visibleWorktrees,
  repositories,
  canLoadRepo,
  isRemoteRepoPath,
  listWorktrees,
  selectWorktree,
}: SwitchWorktreeByPathOptions): Promise<boolean> {
  const tempMatch = tempWorkspaces.find((item) => pathsEqual(item.path, worktreePath));
  if (tempMatch) {
    await selectWorktree({ path: tempMatch.path } as GitWorktree, TEMP_REPO_ID);
    return true;
  }

  const visibleWorktree = visibleWorktrees.find((worktree) =>
    pathsEqual(worktree.path, worktreePath)
  );
  if (visibleWorktree) {
    await selectWorktree(visibleWorktree);
    return true;
  }

  for (const repo of repositories) {
    if (isRemoteRepoPath(repo.path) && !canLoadRepo(repo.path)) {
      continue;
    }

    try {
      const repoWorktrees = sanitizeGitWorktrees(await listWorktrees(repo.path));
      const discoveredWorktree = repoWorktrees.find((worktree) =>
        pathsEqual(worktree.path, worktreePath)
      );
      if (discoveredWorktree) {
        await selectWorktree(discoveredWorktree, repo.path);
        return true;
      }
    } catch {
      // Ignore repo list failures and continue probing the remaining repositories.
    }
  }

  return false;
}
