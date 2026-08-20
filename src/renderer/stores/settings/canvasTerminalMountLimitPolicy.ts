export const DEFAULT_WORKTREE_CANVAS_TERMINAL_MOUNT_LIMIT = 4;
export const MIN_WORKTREE_CANVAS_TERMINAL_MOUNT_LIMIT = 1;
export const MAX_WORKTREE_CANVAS_TERMINAL_MOUNT_LIMIT = 24;

export const DEFAULT_WORKSPACE_CANVAS_TERMINAL_MOUNT_LIMIT = 8;
export const MIN_WORKSPACE_CANVAS_TERMINAL_MOUNT_LIMIT = 1;
export const MAX_WORKSPACE_CANVAS_TERMINAL_MOUNT_LIMIT = 48;

export const WORKTREE_CANVAS_TERMINAL_MOUNT_LIMIT_OPTIONS = [2, 4, 6, 9, 12, 18, 24] as const;
export const WORKSPACE_CANVAS_TERMINAL_MOUNT_LIMIT_OPTIONS = [4, 8, 12, 18, 24, 36, 48] as const;

function normalizeInteger(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value);
  }

  return fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeWorktreeCanvasTerminalMountLimit(
  limit: unknown,
  fallback = DEFAULT_WORKTREE_CANVAS_TERMINAL_MOUNT_LIMIT
): number {
  return clamp(
    normalizeInteger(limit, fallback),
    MIN_WORKTREE_CANVAS_TERMINAL_MOUNT_LIMIT,
    MAX_WORKTREE_CANVAS_TERMINAL_MOUNT_LIMIT
  );
}

export function normalizeWorkspaceCanvasTerminalMountLimit(
  limit: unknown,
  fallback = DEFAULT_WORKSPACE_CANVAS_TERMINAL_MOUNT_LIMIT
): number {
  return clamp(
    normalizeInteger(limit, fallback),
    MIN_WORKSPACE_CANVAS_TERMINAL_MOUNT_LIMIT,
    MAX_WORKSPACE_CANVAS_TERMINAL_MOUNT_LIMIT
  );
}
