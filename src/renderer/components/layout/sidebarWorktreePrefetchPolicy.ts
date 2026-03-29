export interface TreeSidebarWorktreePrefetchInput {
  repoPath: string;
  enabled: boolean;
}

export interface TreeSidebarWorktreePrefetchOptions {
  allRepoPaths: string[];
  hasActiveFilter: boolean;
  canLoadRepo: (repoPath: string) => boolean;
}

export function buildTreeSidebarWorktreePrefetchInputs({
  allRepoPaths,
  hasActiveFilter,
  canLoadRepo,
}: TreeSidebarWorktreePrefetchOptions): TreeSidebarWorktreePrefetchInput[] {
  if (!hasActiveFilter) {
    return [];
  }

  return allRepoPaths.map((repoPath) => ({
    repoPath,
    enabled: canLoadRepo(repoPath),
  }));
}
