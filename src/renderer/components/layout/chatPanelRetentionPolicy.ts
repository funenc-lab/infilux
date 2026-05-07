import { normalizePath } from '@/App/storage';
import { updateRetainedActivityPanelPaths } from './activityPanelLruPolicy';

export const MAX_RETAINED_CHAT_PANEL_PATHS = 4;
export const MAX_SESSION_BACKED_CHAT_PANEL_PATHS = 8;

interface UpdateRetainedChatPanelPathsOptions {
  previousPaths: string[];
  activePath?: string | null;
  hasActivity: (path: string) => boolean;
  sessionBackedPaths?: string[];
}

export function updateRetainedChatPanelPaths({
  previousPaths,
  activePath,
  hasActivity,
  sessionBackedPaths = [],
}: UpdateRetainedChatPanelPathsOptions): string[] {
  const retainedWarmCachePaths = updateRetainedActivityPanelPaths({
    previousPaths,
    activePath,
    hasActivity,
    maxPaths: MAX_RETAINED_CHAT_PANEL_PATHS,
  });

  if (sessionBackedPaths.length === 0) {
    return retainedWarmCachePaths;
  }

  const nextPaths = [...retainedWarmCachePaths];
  const seenPaths = new Set(nextPaths.map((path) => normalizePath(path)));

  for (const path of sessionBackedPaths) {
    if (nextPaths.length >= MAX_SESSION_BACKED_CHAT_PANEL_PATHS) {
      break;
    }

    const normalizedPath = normalizePath(path);
    if (seenPaths.has(normalizedPath) || !hasActivity(path)) {
      continue;
    }

    seenPaths.add(normalizedPath);
    nextPaths.push(path);
  }

  return nextPaths;
}
