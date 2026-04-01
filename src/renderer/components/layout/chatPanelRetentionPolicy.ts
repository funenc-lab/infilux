import { updateRetainedActivityPanelPaths } from './activityPanelLruPolicy';

interface UpdateRetainedChatPanelPathsOptions {
  previousPaths: string[];
  activePath?: string | null;
  hasActivity: (path: string) => boolean;
}

export function updateRetainedChatPanelPaths({
  previousPaths,
  activePath,
  hasActivity,
}: UpdateRetainedChatPanelPathsOptions): string[] {
  return updateRetainedActivityPanelPaths({
    previousPaths,
    activePath,
    hasActivity,
    maxPaths: Number.MAX_SAFE_INTEGER,
  });
}
