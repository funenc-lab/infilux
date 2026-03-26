import { describe, expect, it } from 'vitest';
import { resolveFileSidebarVisibility } from '../fileSidebarVisibilityPolicy';

describe('resolveFileSidebarVisibility', () => {
  it('uses the active worktree path when it exists', () => {
    expect(
      resolveFileSidebarVisibility({
        fileTreeDisplayMode: 'current',
        activeWorktreePath: '/repo/worktrees/active',
        editorWorktreePath: '/repo/worktrees/editor',
      })
    ).toEqual({
      shouldRender: true,
      rootPath: '/repo/worktrees/active',
    });
  });

  it('falls back to the editor worktree path when the active worktree is temporarily unavailable', () => {
    expect(
      resolveFileSidebarVisibility({
        fileTreeDisplayMode: 'current',
        activeWorktreePath: null,
        editorWorktreePath: '/repo/worktrees/editor',
      })
    ).toEqual({
      shouldRender: true,
      rootPath: '/repo/worktrees/editor',
    });
  });

  it('recovers the sidebar root from the active file path when worktree state is missing', () => {
    expect(
      resolveFileSidebarVisibility({
        fileTreeDisplayMode: 'current',
        activeWorktreePath: null,
        editorWorktreePath: null,
        activeFilePath: '/repo/worktrees/feature/src/App.tsx',
        candidateWorktreePaths: ['/repo/worktrees/main', '/repo/worktrees/feature'],
      })
    ).toEqual({
      shouldRender: true,
      rootPath: '/repo/worktrees/feature',
    });
  });

  it('recovers the sidebar root when the active file path matches a candidate worktree path exactly', () => {
    expect(
      resolveFileSidebarVisibility({
        fileTreeDisplayMode: 'current',
        activeWorktreePath: null,
        editorWorktreePath: null,
        activeFilePath: '/repo/worktrees/feature',
        candidateWorktreePaths: ['/repo/worktrees/main', '/repo/worktrees/feature'],
      })
    ).toEqual({
      shouldRender: true,
      rootPath: '/repo/worktrees/feature',
    });
  });

  it('keeps the sidebar hidden when no candidate worktree path matches the active file path', () => {
    expect(
      resolveFileSidebarVisibility({
        fileTreeDisplayMode: 'current',
        activeWorktreePath: null,
        editorWorktreePath: null,
        activeFilePath: '/repo/other/src/App.tsx',
        candidateWorktreePaths: ['/repo/worktrees/main', '/repo/worktrees/feature'],
      })
    ).toEqual({
      shouldRender: false,
      rootPath: null,
    });
  });

  it('does not render the sidebar outside the dedicated sidebar mode', () => {
    expect(
      resolveFileSidebarVisibility({
        fileTreeDisplayMode: 'legacy',
        activeWorktreePath: '/repo/worktrees/active',
        editorWorktreePath: '/repo/worktrees/editor',
      })
    ).toEqual({
      shouldRender: false,
      rootPath: null,
    });
  });
});
