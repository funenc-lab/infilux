import type { GitWorktree } from '@shared/types';
import { useEffect } from 'react';
import { sanitizeGitWorktrees } from '@/lib/worktreeData';

export function useWorktreeSync(
  worktrees: GitWorktree[],
  activeWorktree: GitWorktree | null,
  worktreesFetching: boolean,
  setActiveWorktree: (worktree: GitWorktree | null) => void
) {
  useEffect(() => {
    const safeWorktrees = sanitizeGitWorktrees(worktrees);

    if (safeWorktrees.length > 0 && activeWorktree) {
      const found = safeWorktrees.find((wt) => wt.path === activeWorktree.path);
      if (found && found !== activeWorktree) {
        setActiveWorktree(found);
      } else if (!found && !worktreesFetching) {
        setActiveWorktree(null);
      }
    }
  }, [worktrees, activeWorktree, worktreesFetching, setActiveWorktree]);
}
