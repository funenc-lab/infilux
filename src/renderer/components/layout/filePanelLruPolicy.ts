import { normalizePath } from '@/App/storage';

export const MAX_RETAINED_FILE_PANEL_PATHS = 2;

interface UpdateRetainedFilePanelPathsOptions {
  previousPaths: string[];
  activePath?: string | null;
  getTabCount: (path: string) => number;
  maxPaths?: number;
}

function dedupePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const path of paths) {
    const normalizedPath = normalizePath(path);
    if (seen.has(normalizedPath)) {
      continue;
    }
    seen.add(normalizedPath);
    deduped.push(path);
  }

  return deduped;
}

function hasSameNormalizedPathOrder(previousPaths: string[], nextPaths: string[]): boolean {
  if (previousPaths.length !== nextPaths.length) {
    return false;
  }

  return previousPaths.every(
    (path, index) => normalizePath(path) === normalizePath(nextPaths[index] ?? '')
  );
}

export function updateRetainedFilePanelPaths({
  previousPaths,
  activePath,
  getTabCount,
  maxPaths = MAX_RETAINED_FILE_PANEL_PATHS,
}: UpdateRetainedFilePanelPathsOptions): string[] {
  const nextPaths = dedupePaths([
    ...(activePath && getTabCount(activePath) > 0 ? [activePath] : []),
    ...previousPaths,
  ]);

  const filteredPaths = nextPaths.filter((path) => getTabCount(path) > 0).slice(0, maxPaths);

  return hasSameNormalizedPathOrder(previousPaths, filteredPaths) ? previousPaths : filteredPaths;
}
