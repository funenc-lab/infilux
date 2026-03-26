import { describe, expect, it } from 'vitest';
import {
  shouldAutoExpandFileSidebar,
  shouldAutoExpandIntegratedFileTree,
} from '../fileTreeVisibilityPolicy';

describe('shouldAutoExpandFileSidebar', () => {
  it('returns true when entering the file tab with the dedicated sidebar collapsed', () => {
    expect(
      shouldAutoExpandFileSidebar({
        activeTab: 'file',
        previousActiveTab: 'chat',
        fileTreeDisplayMode: 'current',
        hasActiveWorktree: true,
        isFileSidebarCollapsed: true,
        worktreePath: '/repo/worktrees/demo',
        previousWorktreePath: '/repo/worktrees/demo',
      })
    ).toBe(true);
  });

  it('returns true when switching worktrees while the file tab stays active', () => {
    expect(
      shouldAutoExpandFileSidebar({
        activeTab: 'file',
        previousActiveTab: 'file',
        fileTreeDisplayMode: 'current',
        hasActiveWorktree: true,
        isFileSidebarCollapsed: true,
        worktreePath: '/repo/worktrees/next',
        previousWorktreePath: '/repo/worktrees/current',
      })
    ).toBe(true);
  });

  it('returns true when a different file opens while the file tab is already active', () => {
    expect(
      shouldAutoExpandFileSidebar({
        activeTab: 'file',
        previousActiveTab: 'file',
        fileTreeDisplayMode: 'current',
        hasActiveWorktree: true,
        isFileSidebarCollapsed: true,
        worktreePath: '/repo/worktrees/demo',
        previousWorktreePath: '/repo/worktrees/demo',
        activeFilePath: '/repo/worktrees/demo/src/next.ts',
        previousActiveFilePath: '/repo/worktrees/demo/src/current.ts',
      })
    ).toBe(true);
  });

  it('returns false when the sidebar is already visible', () => {
    expect(
      shouldAutoExpandFileSidebar({
        activeTab: 'file',
        previousActiveTab: 'chat',
        fileTreeDisplayMode: 'current',
        hasActiveWorktree: true,
        isFileSidebarCollapsed: false,
        worktreePath: '/repo/worktrees/demo',
        previousWorktreePath: '/repo/worktrees/demo',
      })
    ).toBe(false);
  });

  it('returns false for the integrated tree mode', () => {
    expect(
      shouldAutoExpandFileSidebar({
        activeTab: 'file',
        previousActiveTab: 'chat',
        fileTreeDisplayMode: 'legacy',
        hasActiveWorktree: true,
        isFileSidebarCollapsed: true,
        worktreePath: '/repo/worktrees/demo',
        previousWorktreePath: '/repo/worktrees/demo',
      })
    ).toBe(false);
  });
});

describe('shouldAutoExpandIntegratedFileTree', () => {
  it('returns true when activating the file panel with the integrated tree collapsed', () => {
    expect(
      shouldAutoExpandIntegratedFileTree({
        isActive: true,
        previousIsActive: false,
        isFileTreeCollapsed: true,
        rootPath: '/repo/worktrees/demo',
        previousRootPath: '/repo/worktrees/demo',
      })
    ).toBe(true);
  });

  it('returns true when the active file panel switches to a different worktree', () => {
    expect(
      shouldAutoExpandIntegratedFileTree({
        isActive: true,
        previousIsActive: true,
        isFileTreeCollapsed: true,
        rootPath: '/repo/worktrees/next',
        previousRootPath: '/repo/worktrees/current',
      })
    ).toBe(true);
  });

  it('returns true when a different file becomes active while the integrated tree is hidden', () => {
    expect(
      shouldAutoExpandIntegratedFileTree({
        isActive: true,
        previousIsActive: true,
        isFileTreeCollapsed: true,
        rootPath: '/repo/worktrees/demo',
        previousRootPath: '/repo/worktrees/demo',
        activeFilePath: '/repo/worktrees/demo/src/next.ts',
        previousActiveFilePath: '/repo/worktrees/demo/src/current.ts',
      })
    ).toBe(true);
  });

  it('returns false after a manual collapse while staying in the same active panel', () => {
    expect(
      shouldAutoExpandIntegratedFileTree({
        isActive: true,
        previousIsActive: true,
        isFileTreeCollapsed: true,
        rootPath: '/repo/worktrees/demo',
        previousRootPath: '/repo/worktrees/demo',
      })
    ).toBe(false);
  });
});
