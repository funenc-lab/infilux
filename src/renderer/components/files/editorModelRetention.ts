export const MAX_INACTIVE_EDITOR_MODELS = 2;
const MAX_RECENT_EDITOR_MODELS = 8;

export function recordRecentEditorModelPath(
  recentPaths: string[],
  nextPath: string | null,
  maxEntries: number = MAX_RECENT_EDITOR_MODELS
): string[] {
  if (!nextPath) {
    return recentPaths;
  }

  const nextRecentPaths = [...recentPaths.filter((path) => path !== nextPath), nextPath];
  return nextRecentPaths.slice(-maxEntries);
}

export function buildRetainedEditorModelPaths({
  activeTabPath,
  openTabPaths,
  recentPaths,
  maxInactiveModels = MAX_INACTIVE_EDITOR_MODELS,
}: {
  activeTabPath: string | null;
  openTabPaths: string[];
  recentPaths: string[];
  maxInactiveModels?: number;
}): Set<string> {
  const openPathSet = new Set(openTabPaths);
  const retainedPaths = new Set<string>();

  if (activeTabPath && openPathSet.has(activeTabPath)) {
    retainedPaths.add(activeTabPath);
  }

  const recentInactivePaths = recentPaths.filter(
    (path) => path !== activeTabPath && openPathSet.has(path)
  );

  for (const path of recentInactivePaths.slice(-maxInactiveModels)) {
    retainedPaths.add(path);
  }

  return retainedPaths;
}
