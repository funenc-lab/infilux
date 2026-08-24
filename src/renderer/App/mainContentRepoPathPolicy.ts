import type { GitWorktree } from '@shared/types';
import { pathsEqual } from './storage';

interface ResolveMainContentRepoPathOptions {
  selectedRepo: string | null;
  activeWorktree: GitWorktree | null;
  selectedRepoWorktrees: GitWorktree[];
  repoWorktreeMap: Record<string, string>;
}

export function resolveSelectedRepositoryIdentity(
  selectedRepo: string,
  selectedRepoWorktrees: GitWorktree[]
): string {
  return selectedRepoWorktrees.find((worktree) => worktree.isMainWorktree)?.path ?? selectedRepo;
}

export function resolveMainContentRepoPath({
  selectedRepo,
  activeWorktree,
  selectedRepoWorktrees,
  repoWorktreeMap,
}: ResolveMainContentRepoPathOptions): string | null {
  if (!activeWorktree) {
    return selectedRepo
      ? resolveSelectedRepositoryIdentity(selectedRepo, selectedRepoWorktrees)
      : selectedRepo;
  }

  if (
    selectedRepo &&
    selectedRepoWorktrees.some((worktree) => pathsEqual(worktree.path, activeWorktree.path))
  ) {
    return resolveSelectedRepositoryIdentity(selectedRepo, selectedRepoWorktrees);
  }

  for (const [repoPath, worktreePath] of Object.entries(repoWorktreeMap)) {
    if (pathsEqual(worktreePath, activeWorktree.path)) {
      return repoPath;
    }
  }

  return selectedRepo;
}
