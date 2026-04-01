export interface TreeSidebarWorktreePrefetchInput {
  repoPath: string;
  enabled: boolean;
}

export interface TreeSidebarWorktreePrefetchOptions {
  allRepoPaths: string[];
  hasActiveFilter: boolean;
  canLoadRepo: (repoPath: string) => boolean;
  loadedRepoPaths?: readonly string[];
  activeRepoPaths?: readonly string[];
}

export function buildTreeSidebarWorktreePrefetchInputs({
  allRepoPaths,
  hasActiveFilter,
  canLoadRepo,
  loadedRepoPaths = [],
  activeRepoPaths = [],
}: TreeSidebarWorktreePrefetchOptions): TreeSidebarWorktreePrefetchInput[] {
  if (!hasActiveFilter) {
    return [];
  }

  const skippedRepoPaths = new Set([...loadedRepoPaths, ...activeRepoPaths]);

  return allRepoPaths
    .filter((repoPath) => !skippedRepoPaths.has(repoPath))
    .map((repoPath) => ({
      repoPath,
      enabled: canLoadRepo(repoPath),
    }));
}
