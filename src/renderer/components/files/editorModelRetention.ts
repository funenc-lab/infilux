import { normalizePath } from '@/App/storage';

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

  const normalizedNextPath = normalizePath(nextPath);
  const nextRecentPaths = [
    ...recentPaths.filter((path) => normalizePath(path) !== normalizedNextPath),
    nextPath,
  ];
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
  const openPathMap = new Map(openTabPaths.map((path) => [normalizePath(path), path]));
  const retainedPaths = new Set<string>();
  const normalizedActiveTabPath = activeTabPath ? normalizePath(activeTabPath) : null;

  if (normalizedActiveTabPath) {
    const canonicalActivePath = openPathMap.get(normalizedActiveTabPath);
    if (canonicalActivePath) {
      retainedPaths.add(canonicalActivePath);
    }
  }

  const recentInactivePaths = recentPaths
    .map((path) => openPathMap.get(normalizePath(path)) ?? null)
    .filter((path): path is string => path !== null)
    .filter((path) => path !== openPathMap.get(normalizedActiveTabPath ?? ''));

  for (const path of recentInactivePaths.slice(-maxInactiveModels)) {
    retainedPaths.add(path);
  }

  return retainedPaths;
}
