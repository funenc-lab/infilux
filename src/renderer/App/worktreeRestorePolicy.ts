import type { GitWorktree } from '@shared/types';
import { sanitizeGitWorktrees } from '@/lib/worktreeData';
import { pathsEqual } from './storage';

interface ShouldPruneSavedWorktreePathArgs {
  savedWorktreePath: string | null | undefined;
  worktrees: GitWorktree[];
  worktreesFetched: boolean;
  worktreesFetching: boolean;
  hasWorktreeError: boolean;
}

export function shouldPruneSavedWorktreePath({
  savedWorktreePath,
  worktrees,
  worktreesFetched,
  worktreesFetching,
  hasWorktreeError,
}: ShouldPruneSavedWorktreePathArgs): boolean {
  if (!savedWorktreePath || !worktreesFetched || worktreesFetching || hasWorktreeError) {
    return false;
  }

  const safeWorktrees = sanitizeGitWorktrees(worktrees);
  return !safeWorktrees.some((worktree) => pathsEqual(worktree.path, savedWorktreePath));
}
