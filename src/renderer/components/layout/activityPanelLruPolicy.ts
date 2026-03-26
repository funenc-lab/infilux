import { normalizePath } from '@/App/storage';

export const MAX_RETAINED_ACTIVITY_PANEL_PATHS = 2;

interface UpdateRetainedActivityPanelPathsOptions {
  previousPaths: string[];
  activePath?: string | null;
  hasActivity: (path: string) => boolean;
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

export function updateRetainedActivityPanelPaths({
  previousPaths,
  activePath,
  hasActivity,
  maxPaths = MAX_RETAINED_ACTIVITY_PANEL_PATHS,
}: UpdateRetainedActivityPanelPathsOptions): string[] {
  const nextPaths = dedupePaths([
    ...(activePath && hasActivity(activePath) ? [activePath] : []),
    ...previousPaths,
  ]);

  const filteredPaths = nextPaths.filter((path) => hasActivity(path)).slice(0, maxPaths);

  return hasSameNormalizedPathOrder(previousPaths, filteredPaths) ? previousPaths : filteredPaths;
}
