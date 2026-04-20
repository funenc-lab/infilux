import type { GitWorktree } from '@shared/types';
import { describe, expect, it, vi } from 'vitest';
import { TEMP_REPO_ID } from '@/App/constants';
import { switchWorktreeByPath } from '../worktreePathSelection';

function makeWorktree(path: string): GitWorktree {
  return {
    path,
    head: 'abc123',
    branch: 'feature',
    isMainWorktree: false,
    isLocked: false,
    prunable: false,
  };
}

describe('switchWorktreeByPath', () => {
  it('switches a discovered cross-repo worktree through selectWorktree with the owner repo path', async () => {
    const targetWorktree = makeWorktree('/repo-b/.worktrees/feature-b');
    const selectWorktree = vi.fn();
    const listWorktrees = vi.fn(async (repoPath: string) =>
      repoPath === '/repo-b' ? [targetWorktree] : []
    );

    const handled = await switchWorktreeByPath({
      worktreePath: targetWorktree.path,
      tempWorkspaces: [],
      visibleWorktrees: [],
      repositories: [
        { id: 'repo-a', name: 'repo-a', path: '/repo-a', kind: 'local' },
        { id: 'repo-b', name: 'repo-b', path: '/repo-b', kind: 'local' },
      ],
      canLoadRepo: () => true,
      isRemoteRepoPath: () => false,
      listWorktrees,
      selectWorktree,
    });

    expect(handled).toBe(true);
    expect(listWorktrees).toHaveBeenCalledWith('/repo-a');
    expect(listWorktrees).toHaveBeenCalledWith('/repo-b');
    expect(selectWorktree).toHaveBeenCalledWith(targetWorktree, '/repo-b');
  });

  it('switches a visible worktree without overriding the current repository', async () => {
    const targetWorktree = makeWorktree('/repo-a/.worktrees/feature-a');
    const selectWorktree = vi.fn();

    const handled = await switchWorktreeByPath({
      worktreePath: targetWorktree.path,
      tempWorkspaces: [],
      visibleWorktrees: [targetWorktree],
      repositories: [],
      canLoadRepo: () => true,
      isRemoteRepoPath: () => false,
      listWorktrees: vi.fn(),
      selectWorktree,
    });

    expect(handled).toBe(true);
    expect(selectWorktree).toHaveBeenCalledWith(targetWorktree);
  });

  it('matches discovered worktrees with normalized path comparison', async () => {
    const targetWorktree = makeWorktree('/repo-b/.worktrees/feature-b');
    const selectWorktree = vi.fn();
    const listWorktrees = vi.fn(async () => [targetWorktree]);

    const handled = await switchWorktreeByPath({
      worktreePath: '/repo-b/.worktrees/feature-b/',
      tempWorkspaces: [],
      visibleWorktrees: [],
      repositories: [{ id: 'repo-b', name: 'repo-b', path: '/repo-b', kind: 'local' }],
      canLoadRepo: () => true,
      isRemoteRepoPath: () => false,
      listWorktrees,
      selectWorktree,
    });

    expect(handled).toBe(true);
    expect(selectWorktree).toHaveBeenCalledWith(targetWorktree, '/repo-b');
  });

  it('routes temporary workspaces through the temp repository id', async () => {
    const selectWorktree = vi.fn();

    const handled = await switchWorktreeByPath({
      worktreePath: '/tmp/workspace',
      tempWorkspaces: [{ path: '/tmp/workspace' }],
      visibleWorktrees: [],
      repositories: [],
      canLoadRepo: () => true,
      isRemoteRepoPath: () => false,
      listWorktrees: vi.fn(),
      selectWorktree,
    });

    expect(handled).toBe(true);
    expect(selectWorktree).toHaveBeenCalledWith({ path: '/tmp/workspace' }, TEMP_REPO_ID);
  });
});
