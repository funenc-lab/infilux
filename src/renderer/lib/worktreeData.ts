import type { GitWorktree, TempWorkspaceItem } from '@shared/types';

function hasNonEmptyPath(value: unknown): value is { path: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'path' in value &&
    typeof value.path === 'string' &&
    value.path.trim().length > 0
  );
}

export function isGitWorktreeRecord(value: unknown): value is GitWorktree {
  return hasNonEmptyPath(value);
}

export function sanitizeGitWorktrees(
  worktrees: readonly (GitWorktree | null | undefined)[]
): GitWorktree[] {
  return worktrees.filter(isGitWorktreeRecord);
}

export function isTempWorkspaceItemRecord(value: unknown): value is TempWorkspaceItem {
  if (!hasNonEmptyPath(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.trim().length > 0 &&
    typeof candidate.title === 'string' &&
    typeof candidate.folderName === 'string' &&
    typeof candidate.createdAt === 'number' &&
    Number.isFinite(candidate.createdAt)
  );
}

export function sanitizeTempWorkspaceItems(
  items: readonly (TempWorkspaceItem | null | undefined)[]
): TempWorkspaceItem[] {
  return items.filter(isTempWorkspaceItemRecord);
}
