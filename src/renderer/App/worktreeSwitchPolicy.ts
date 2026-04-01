import type { GitWorktree } from '@shared/types';
import { sanitizeGitWorktrees } from '@/lib/worktreeData';
import { pathsEqual } from './storage';

type WorktreeSyncAction =
  | { type: 'retain' }
  | { type: 'clear' }
  | { type: 'replace'; worktree: GitWorktree };

interface ResolveWorktreeSyncActionArgs {
  worktrees: GitWorktree[];
  activeWorktree: GitWorktree | null;
  selectedRepoCanLoad: boolean;
  worktreesFetched: boolean;
  worktreesFetching: boolean;
  hasWorktreeError: boolean;
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

function areEquivalentWorktrees(left: GitWorktree, right: GitWorktree) {
  return (
    left.path === right.path &&
    left.head === right.head &&
    left.branch === right.branch &&
    left.isMainWorktree === right.isMainWorktree &&
    left.isLocked === right.isLocked &&
    left.prunable === right.prunable
  );
}

export function resolveWorktreeSyncAction({
  worktrees,
  activeWorktree,
  selectedRepoCanLoad,
  worktreesFetched,
  worktreesFetching,
  hasWorktreeError,
}: ResolveWorktreeSyncActionArgs): WorktreeSyncAction {
  if (!activeWorktree) {
    return { type: 'retain' };
  }

  const safeWorktrees = sanitizeGitWorktrees(worktrees);
  const matchedWorktree = safeWorktrees.find((worktree) =>
    pathsEqual(worktree.path, activeWorktree.path)
  );

  if (
    matchedWorktree &&
    (!isHydratedWorktree(activeWorktree) ||
      !areEquivalentWorktrees(matchedWorktree, activeWorktree))
  ) {
    return { type: 'replace', worktree: matchedWorktree };
  }

  if (matchedWorktree) {
    return { type: 'retain' };
  }

  if (!selectedRepoCanLoad || !worktreesFetched || worktreesFetching) {
    return { type: 'retain' };
  }

  if (safeWorktrees.length === 0 && !hasWorktreeError) {
    return { type: 'retain' };
  }

  return { type: 'clear' };
}
