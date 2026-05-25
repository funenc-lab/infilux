import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WORKSPACE_CANVAS_TERMINAL_MOUNT_LIMIT,
  DEFAULT_WORKTREE_CANVAS_TERMINAL_MOUNT_LIMIT,
  MAX_WORKSPACE_CANVAS_TERMINAL_MOUNT_LIMIT,
  MAX_WORKTREE_CANVAS_TERMINAL_MOUNT_LIMIT,
  MIN_WORKSPACE_CANVAS_TERMINAL_MOUNT_LIMIT,
  MIN_WORKTREE_CANVAS_TERMINAL_MOUNT_LIMIT,
  normalizeWorkspaceCanvasTerminalMountLimit,
  normalizeWorktreeCanvasTerminalMountLimit,
} from '../canvasTerminalMountLimitPolicy';

describe('canvas terminal mount limit policy', () => {
  it('normalizes worktree canvas terminal limits to bounded whole numbers', () => {
    expect(DEFAULT_WORKTREE_CANVAS_TERMINAL_MOUNT_LIMIT).toBe(6);
    expect(normalizeWorktreeCanvasTerminalMountLimit(8.9)).toBe(8);
    expect(normalizeWorktreeCanvasTerminalMountLimit(0)).toBe(
      MIN_WORKTREE_CANVAS_TERMINAL_MOUNT_LIMIT
    );
    expect(normalizeWorktreeCanvasTerminalMountLimit(99)).toBe(
      MAX_WORKTREE_CANVAS_TERMINAL_MOUNT_LIMIT
    );
    expect(normalizeWorktreeCanvasTerminalMountLimit(Number.NaN, 10)).toBe(10);
  });

  it('normalizes workspace canvas terminal limits to bounded whole numbers', () => {
    expect(DEFAULT_WORKSPACE_CANVAS_TERMINAL_MOUNT_LIMIT).toBe(12);
    expect(normalizeWorkspaceCanvasTerminalMountLimit(20.8)).toBe(20);
    expect(normalizeWorkspaceCanvasTerminalMountLimit(0)).toBe(
      MIN_WORKSPACE_CANVAS_TERMINAL_MOUNT_LIMIT
    );
    expect(normalizeWorkspaceCanvasTerminalMountLimit(99)).toBe(
      MAX_WORKSPACE_CANVAS_TERMINAL_MOUNT_LIMIT
    );
    expect(normalizeWorkspaceCanvasTerminalMountLimit(Number.NaN, 18)).toBe(18);
  });
});
