export interface FileTreeWatchOptions {
  rootPath: string | undefined;
  enabled: boolean;
  isActive: boolean;
  shouldPoll: boolean;
}

export interface FileTreeWatchStateSnapshot {
  rootPath: string | undefined;
  shouldWatch: boolean;
}

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
  next: FileTreeWatchStateSnapshot
): boolean {
  return previous.rootPath === next.rootPath && !previous.shouldWatch && next.shouldWatch;
}
