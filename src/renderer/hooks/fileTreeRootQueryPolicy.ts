import { FILE_TREE_TAB_REACTIVATION_REFRESH_THRESHOLD_MS } from './fileTreeWatchPolicy';

export const FILE_TREE_ROOT_QUERY_STALE_TIME_MS = FILE_TREE_TAB_REACTIVATION_REFRESH_THRESHOLD_MS;

export function shouldInvalidateFileTreeRootQueryOnRootChange(
  previousRootPath: string | undefined,
  nextRootPath: string | undefined
): boolean {
  return Boolean(previousRootPath && nextRootPath && previousRootPath !== nextRootPath);
}

export function shouldRefetchFileTreeRootQueryOnMount(options: {
  lastInactiveAt: number | null;
  now?: number;
  remountRefreshThresholdMs?: number;
}): boolean {
  const {
    lastInactiveAt,
    now = Date.now(),
    remountRefreshThresholdMs = FILE_TREE_ROOT_QUERY_STALE_TIME_MS,
  } = options;

  if (lastInactiveAt === null) {
    return true;
  }

  return now - lastInactiveAt >= remountRefreshThresholdMs;
}
