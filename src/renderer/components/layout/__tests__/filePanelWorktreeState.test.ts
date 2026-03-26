import { describe, expect, it, vi } from 'vitest';
import { getFileTabCountForWorktree } from '../filePanelWorktreeState';

describe('filePanelWorktreeState', () => {
  it('matches the current worktree on case-insensitive platforms using normalized paths', () => {
    vi.stubGlobal('navigator', {
      platform: 'MacIntel',
    });

    expect(
      getFileTabCountForWorktree({
        targetWorktreePath: '/repo/main/worktrees/current',
        currentWorktreePath: '/Repo/Main/Worktrees/Current',
        currentTabCount: 2,
        worktreeStates: {},
      })
    ).toBe(2);
  });

  it('finds persisted worktree tabs with normalized path matching', () => {
    vi.stubGlobal('navigator', {
      platform: 'MacIntel',
    });

    expect(
      getFileTabCountForWorktree({
        targetWorktreePath: '/repo/main/worktrees/feature',
        currentWorktreePath: '/Repo/Main/Worktrees/Current',
        currentTabCount: 1,
        worktreeStates: {
          '/Repo/Main/Worktrees/Feature': {
            tabs: [{ path: '/Repo/Main/Worktrees/Feature/src/App.tsx' }],
          },
        },
      })
    ).toBe(1);
  });
});
