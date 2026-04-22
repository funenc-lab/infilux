export interface FileTreeWatchOptions {
  rootPath: string | undefined;
  enabled: boolean;
  isActive: boolean;
  shouldPoll: boolean;
}

export interface FileTreeWatchStateSnapshot {
  rootPath: string | undefined;
  shouldWatch: boolean;
  isActive: boolean;
  shouldPoll: boolean;
  updatedAt: number;
}

export const FILE_TREE_TAB_REACTIVATION_REFRESH_THRESHOLD_MS = 1_000;

export function shouldWatchFileTree({
  rootPath,
  enabled,
  isActive,
  shouldPoll,
}: FileTreeWatchOptions): boolean {
  return Boolean(rootPath && enabled && isActive && shouldPoll);
}

export function shouldRefreshFileTreeOnWatchResume(
  previous: FileTreeWatchStateSnapshot,
  next: FileTreeWatchStateSnapshot,
  tabReactivationRefreshThresholdMs = FILE_TREE_TAB_REACTIVATION_REFRESH_THRESHOLD_MS
): boolean {
  if (previous.rootPath !== next.rootPath || previous.shouldWatch || !next.shouldWatch) {
    return false;
  }

  if (!previous.shouldPoll && next.shouldPoll) {
    return true;
  }

  if (!previous.isActive && next.isActive) {
    return next.updatedAt - previous.updatedAt >= tabReactivationRefreshThresholdMs;
  }

  return false;
}
