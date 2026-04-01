import type { GitWorktree } from '@shared/types';
import { sanitizeGitWorktrees } from '@/lib/worktreeData';

interface ResolveTreeSidebarRepoSnapshotArgs {
  repoPath: string;
  selectedRepo: string | null;
  selectedWorktrees: GitWorktree[];
  selectedActiveWorktree?: GitWorktree | null;
  selectedActiveWorktreePath?: string | null;
  selectedIsLoading?: boolean;
  selectedIsFetching?: boolean;
  selectedError?: string | null;
  worktreesMap: Record<string, GitWorktree[] | undefined>;
  loadingMap: Record<string, boolean | undefined>;
  errorsMap: Record<string, string | null | undefined>;
  isExpanded: boolean;
  canLoad: boolean;
}

interface TreeSidebarRepoSnapshot {
  worktrees: GitWorktree[];
  isLoading: boolean;
  error: string | null;
}

function shouldPreferExpandedSnapshot(
  isSelectedRepo: boolean,
  selectedSnapshotWorktrees: GitWorktree[],
  expandedWorktrees: GitWorktree[],
  selectedActiveWorktreePath: string | null
) {
  if (!isSelectedRepo || expandedWorktrees.length === 0) {
    return false;
  }

  if (selectedSnapshotWorktrees.length === 0) {
    return true;
  }

  const selectedSnapshotPaths = new Set(selectedSnapshotWorktrees.map((worktree) => worktree.path));
  const expandedSnapshotPaths = new Set(expandedWorktrees.map((worktree) => worktree.path));
  const expandedContainsSelectedSnapshot = selectedSnapshotWorktrees.every((worktree) =>
    expandedSnapshotPaths.has(worktree.path)
  );

  if (
    expandedContainsSelectedSnapshot &&
    expandedWorktrees.length > selectedSnapshotWorktrees.length
  ) {
    return true;
  }

  if (!selectedActiveWorktreePath) {
    return false;
  }

  const selectedSnapshotHasActiveWorktree = selectedSnapshotPaths.has(selectedActiveWorktreePath);
  const expandedSnapshotHasActiveWorktree = expandedSnapshotPaths.has(selectedActiveWorktreePath);

  return expandedSnapshotHasActiveWorktree && !selectedSnapshotHasActiveWorktree;
}

function isHydratedWorktree(worktree: GitWorktree | null | undefined): worktree is GitWorktree {
  if (!worktree) {
    return false;
  }

  return (
    typeof worktree.head === 'string' &&
    typeof worktree.isLocked === 'boolean' &&
    typeof worktree.prunable === 'boolean'
  );
}

export function resolveTreeSidebarRepoSnapshot({
  repoPath,
  selectedRepo,
  selectedWorktrees,
  selectedActiveWorktree = null,
  selectedActiveWorktreePath = null,
  selectedIsLoading = false,
  selectedIsFetching = false,
  selectedError = null,
  worktreesMap,
  loadingMap,
  errorsMap,
  isExpanded,
  canLoad,
}: ResolveTreeSidebarRepoSnapshotArgs): TreeSidebarRepoSnapshot {
  const isSelectedRepo = selectedRepo === repoPath;
  const hasExpandedSnapshot = Object.hasOwn(worktreesMap, repoPath);
  const expandedWorktrees = sanitizeGitWorktrees(worktreesMap[repoPath] || []);
  const selectedSnapshotWorktrees = sanitizeGitWorktrees(selectedWorktrees);
  const preferExpandedSnapshot = shouldPreferExpandedSnapshot(
    isSelectedRepo,
    selectedSnapshotWorktrees,
    expandedWorktrees,
    selectedActiveWorktreePath
  );
  const shouldShowSelectedActiveWorktree =
    isSelectedRepo &&
    expandedWorktrees.length === 0 &&
    selectedSnapshotWorktrees.length === 0 &&
    isHydratedWorktree(selectedActiveWorktree);
  const worktrees = isSelectedRepo
    ? preferExpandedSnapshot
      ? expandedWorktrees
      : shouldShowSelectedActiveWorktree
        ? [selectedActiveWorktree]
        : selectedSnapshotWorktrees
    : expandedWorktrees;
  const error = isSelectedRepo ? selectedError : (errorsMap[repoPath] ?? null);

  if (!canLoad) {
    return {
      worktrees,
      isLoading: false,
      error,
    };
  }

  const fallbackLoading =
    isExpanded && !hasExpandedSnapshot && (!isSelectedRepo || worktrees.length === 0);

  return {
    worktrees,
    isLoading: isSelectedRepo
      ? selectedIsLoading ||
        selectedIsFetching ||
        fallbackLoading ||
        shouldShowSelectedActiveWorktree
      : (loadingMap[repoPath] ?? fallbackLoading),
    error,
  };
}
