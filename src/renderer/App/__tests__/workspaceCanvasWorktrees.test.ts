import { describe, expect, it } from 'vitest';
import { resolveWorkspaceCanvasWorktrees } from '../workspaceCanvasWorktrees';

describe('workspace canvas worktrees', () => {
  it('includes session-backed worktrees from attached repositories', () => {
    expect(
      resolveWorkspaceCanvasWorktrees({
        activeWorktreePath: '/repo/current',
        mainContentRepoPath: '/repo',
        repositories: [{ path: '/repo' }, { path: '/other' }],
        repoWorktreeMap: {
          '/repo': '/repo/current',
        },
        sessions: [
          {
            repoPath: '/repo',
            cwd: '/repo/session-backed',
          },
          {
            repoPath: '/other',
            cwd: '/other/session-backed',
          },
        ],
      })
    ).toEqual([
      {
        repoPath: '/repo',
        worktreePath: '/repo/current',
      },
      {
        repoPath: '/repo',
        worktreePath: '/repo/session-backed',
      },
      {
        repoPath: '/other',
        worktreePath: '/other/session-backed',
      },
    ]);
  });

  it('drops session-backed worktrees for repositories no longer attached to the window', () => {
    expect(
      resolveWorkspaceCanvasWorktrees({
        activeWorktreePath: '/repo/current',
        mainContentRepoPath: '/repo',
        repositories: [{ path: '/repo' }],
        repoWorktreeMap: {},
        sessions: [
          {
            repoPath: '/removed',
            cwd: '/removed/worktree',
          },
        ],
      })
    ).toEqual([
      {
        repoPath: '/repo',
        worktreePath: '/repo/current',
      },
    ]);
  });
});
