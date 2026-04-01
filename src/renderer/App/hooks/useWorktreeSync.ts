import type { GitWorktree } from '@shared/types';
import { useEffect } from 'react';
import { resolveWorktreeSyncAction } from '../worktreeSwitchPolicy';

export function useWorktreeSync(
  worktrees: GitWorktree[],
  activeWorktree: GitWorktree | null,
  selectedRepoCanLoad: boolean,
  worktreesFetched: boolean,
  worktreesFetching: boolean,
  hasWorktreeError: boolean,
  setActiveWorktree: (worktree: GitWorktree | null) => void
) {
  useEffect(() => {
    const action = resolveWorktreeSyncAction({
      worktrees,
      activeWorktree,
      selectedRepoCanLoad,
      worktreesFetched,
      worktreesFetching,
      hasWorktreeError,
    });

    if (action.type === 'replace') {
      setActiveWorktree(action.worktree);
      return;
    }

    if (action.type === 'clear') {
      setActiveWorktree(null);
    }
  }, [
    worktrees,
    activeWorktree,
    selectedRepoCanLoad,
    worktreesFetched,
    worktreesFetching,
    hasWorktreeError,
    setActiveWorktree,
  ]);
}
