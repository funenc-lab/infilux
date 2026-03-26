interface ShouldRecoverRootFileListOptions {
  hasRootPath: boolean;
  isRootLoading: boolean;
  isRootError: boolean;
  rootFileCount: number | null;
  alreadyRecovered: boolean;
}

export function shouldRecoverRootFileList({
  hasRootPath,
  isRootLoading,
  isRootError,
  rootFileCount,
  alreadyRecovered,
}: ShouldRecoverRootFileListOptions): boolean {
  if (!hasRootPath || isRootLoading || alreadyRecovered) {
    return false;
  }

  if (isRootError) {
    return true;
  }

  return rootFileCount === 0;
}
