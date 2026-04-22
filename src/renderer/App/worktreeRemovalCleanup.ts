import type { GitWorktree } from '@shared/types';

interface ClearRemovedWorktreeUiStateOptions {
  worktreePath: string;
  activeWorktreePath: string | null;
  clearEditorWorktreeState: (worktreePath: string) => void;
  clearWorktreeActivity: (worktreePath: string) => void;
  setActiveWorktree: (worktree: GitWorktree | null) => void;
}

export function clearRemovedWorktreeUiState({
  worktreePath,
  activeWorktreePath,
  clearEditorWorktreeState,
  clearWorktreeActivity,
  setActiveWorktree,
}: ClearRemovedWorktreeUiStateOptions): void {
  clearEditorWorktreeState(worktreePath);
  clearWorktreeActivity(worktreePath);

  if (activeWorktreePath === worktreePath) {
    setActiveWorktree(null);
  }
}
