import type { GitWorktree } from '@shared/types';
import { sanitizeGitWorktrees } from '@/lib/worktreeData';

interface ResolveTreeSidebarSelectedWorktreesArgs {
  worktrees: GitWorktree[];
  cachedWorktrees: GitWorktree[];
}

export function resolveTreeSidebarSelectedWorktrees({
  worktrees,
  cachedWorktrees,
}: ResolveTreeSidebarSelectedWorktreesArgs): GitWorktree[] {
  const safeWorktrees = sanitizeGitWorktrees(worktrees);
  if (safeWorktrees.length > 0) {
    return safeWorktrees;
  }

  return sanitizeGitWorktrees(cachedWorktrees);
}
