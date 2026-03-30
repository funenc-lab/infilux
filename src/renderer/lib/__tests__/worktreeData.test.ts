import type { GitWorktree, TempWorkspaceItem } from '@shared/types';
import { describe, expect, it } from 'vitest';
import { sanitizeGitWorktrees, sanitizeTempWorkspaceItems } from '../worktreeData';

function makeWorktree(overrides: Partial<GitWorktree> = {}): GitWorktree {
  return {
    path: '/repo',
    head: 'abc123',
    branch: 'main',
    isMainWorktree: false,
    isLocked: false,
    prunable: false,
    ...overrides,
  };
}

function makeTempWorkspace(overrides: Partial<TempWorkspaceItem> = {}): TempWorkspaceItem {
  return {
    id: 'temp-1',
    path: '/tmp/session-1',
    folderName: 'session-1',
    title: 'Session 1',
    createdAt: 1,
    ...overrides,
  };
}

describe('worktreeData', () => {
  it('removes malformed worktree entries before UI code consumes them', () => {
    const result = sanitizeGitWorktrees([
      makeWorktree({ path: '/repo/main' }),
      undefined,
      null,
      { branch: 'broken' } as unknown as GitWorktree,
      makeWorktree({ path: '/repo/feature' }),
    ]);

    expect(result.map((item) => item.path)).toEqual(['/repo/main', '/repo/feature']);
  });

  it('treats missing worktree lists as empty during async loading states', () => {
    expect(sanitizeGitWorktrees(undefined)).toEqual([]);
    expect(sanitizeGitWorktrees(null)).toEqual([]);
    expect(sanitizeGitWorktrees({ worktrees: [] } as unknown as GitWorktree[])).toEqual([]);
  });

  it('removes malformed temp workspace entries before sidebar filtering', () => {
    const result = sanitizeTempWorkspaceItems([
      makeTempWorkspace({ id: 'temp-1', path: '/tmp/a' }),
      undefined,
      { id: 'temp-2', title: 'Broken' } as unknown as TempWorkspaceItem,
      makeTempWorkspace({ id: 'temp-3', path: '/tmp/b' }),
    ]);

    expect(result.map((item) => item.path)).toEqual(['/tmp/a', '/tmp/b']);
  });
});
