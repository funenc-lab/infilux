import type { GitWorktree } from '@shared/types';
import { sanitizeGitWorktrees } from '@/lib/worktreeData';

export function resolvePreferredWorktreeSelection(
  selectedRepo: string | null,
  worktrees: GitWorktree[]
): GitWorktree | null {
  const safeWorktrees = sanitizeGitWorktrees(worktrees);

  if (!selectedRepo || safeWorktrees.length === 0) {
    return null;
  }

  return (
    safeWorktrees.find((worktree) => worktree.isMainWorktree) ??
    safeWorktrees.find((worktree) => worktree.path === selectedRepo) ??
    safeWorktrees[0] ??
    null
  );
}
