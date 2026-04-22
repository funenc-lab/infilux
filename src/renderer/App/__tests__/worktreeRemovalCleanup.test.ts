import { describe, expect, it, vi } from 'vitest';
import { clearRemovedWorktreeUiState } from '../worktreeRemovalCleanup';

describe('clearRemovedWorktreeUiState', () => {
  it('clears editor and activity state for a removed worktree', () => {
    const clearEditorWorktreeState = vi.fn();
    const clearWorktreeActivity = vi.fn();
    const setActiveWorktree = vi.fn();

    clearRemovedWorktreeUiState({
      worktreePath: '/repo/worktree-a',
      activeWorktreePath: '/repo/worktree-b',
      clearEditorWorktreeState,
      clearWorktreeActivity,
      setActiveWorktree,
    });

    expect(clearEditorWorktreeState).toHaveBeenCalledWith('/repo/worktree-a');
    expect(clearWorktreeActivity).toHaveBeenCalledWith('/repo/worktree-a');
    expect(setActiveWorktree).not.toHaveBeenCalled();
  });

  it('clears the active worktree selection when the removed worktree is active', () => {
    const clearEditorWorktreeState = vi.fn();
    const clearWorktreeActivity = vi.fn();
    const setActiveWorktree = vi.fn();

    clearRemovedWorktreeUiState({
      worktreePath: '/repo/worktree-a',
      activeWorktreePath: '/repo/worktree-a',
      clearEditorWorktreeState,
      clearWorktreeActivity,
      setActiveWorktree,
    });

    expect(setActiveWorktree).toHaveBeenCalledWith(null);
  });
});
