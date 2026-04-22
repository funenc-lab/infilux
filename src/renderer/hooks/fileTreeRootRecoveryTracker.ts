export interface FileTreeRootRecoveryTracker {
  has: (rootPath: string) => boolean;
  mark: (rootPath: string) => void;
  reset: () => void;
  clear: (rootPath: string) => void;
}

export function createFileTreeRootRecoveryTracker(): FileTreeRootRecoveryTracker {
  let recoveredRootPath: string | null = null;

  return {
    has: (rootPath) => recoveredRootPath === rootPath,
    mark: (rootPath) => {
      recoveredRootPath = rootPath;
    },
    reset: () => {
      recoveredRootPath = null;
    },
    clear: (rootPath) => {
      if (recoveredRootPath === rootPath) {
        recoveredRootPath = null;
      }
    },
  };
}
