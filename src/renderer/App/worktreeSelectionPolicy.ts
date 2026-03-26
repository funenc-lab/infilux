import type { GitWorktree } from '@shared/types';

export function resolvePreferredWorktreeSelection(
  selectedRepo: string | null,
  worktrees: GitWorktree[]
): GitWorktree | null {
  if (!selectedRepo || worktrees.length === 0) {
    return null;
  }

  return (
    worktrees.find((worktree) => worktree.isMainWorktree) ??
    worktrees.find((worktree) => worktree.path === selectedRepo) ??
    worktrees[0] ??
    null
  );
}
