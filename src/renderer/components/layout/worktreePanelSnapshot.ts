import type { GitWorktree } from '@shared/types';
import { sanitizeGitWorktrees } from '@/lib/worktreeData';

interface ResolveWorktreePanelSnapshotArgs {
  worktrees: GitWorktree[];
  cachedWorktrees: GitWorktree[];
  activeWorktree: GitWorktree | null;
}

function isHydratedWorktree(worktree: GitWorktree | null): worktree is GitWorktree {
  if (!worktree) {
    return false;
  }

  return (
    typeof worktree.head === 'string' &&
    typeof worktree.isLocked === 'boolean' &&
    typeof worktree.prunable === 'boolean'
  );
}

export function resolveWorktreePanelSnapshot({
  worktrees,
  cachedWorktrees,
  activeWorktree,
}: ResolveWorktreePanelSnapshotArgs): GitWorktree[] {
  const safeWorktrees = sanitizeGitWorktrees(worktrees);
  const safeCachedWorktrees = sanitizeGitWorktrees(cachedWorktrees);

  if (safeWorktrees.length > 0) {
    return safeWorktrees;
  }

  if (!activeWorktree?.path) {
    return safeCachedWorktrees;
  }

  const hasActiveWorktree = safeWorktrees.some((worktree) => worktree.path === activeWorktree.path);
  if (hasActiveWorktree) {
    return safeWorktrees;
  }

  const cachedActiveWorktree = safeCachedWorktrees.find(
    (worktree) => worktree.path === activeWorktree.path
  );
  if (cachedActiveWorktree) {
    return safeCachedWorktrees;
  }

  if (safeCachedWorktrees.length > 0) {
    return safeCachedWorktrees;
  }

  if (isHydratedWorktree(activeWorktree)) {
    return [activeWorktree];
  }

  return [];
}
