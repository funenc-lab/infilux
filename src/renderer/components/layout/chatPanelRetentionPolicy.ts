import { updateRetainedActivityPanelPaths } from './activityPanelLruPolicy';

export const MAX_RETAINED_CHAT_PANEL_PATHS = 4;

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
    maxPaths: MAX_RETAINED_CHAT_PANEL_PATHS,
  });
}
