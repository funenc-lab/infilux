const MAX_TRACKED_ROOT_PATHS = 32;

export interface FileTreeRootQueryRemountTracker {
  clear(rootPath: string): void;
  getLastInactiveAt(rootPath: string): number | null;
  markInactive(rootPath: string, inactiveAt?: number): void;
  reset(): void;
}

export function createFileTreeRootQueryRemountTracker(): FileTreeRootQueryRemountTracker {
  const lastInactiveAtByRootPath = new Map<string, number>();

  return {
    markInactive(rootPath, inactiveAt = Date.now()) {
      lastInactiveAtByRootPath.delete(rootPath);
      lastInactiveAtByRootPath.set(rootPath, inactiveAt);

      if (lastInactiveAtByRootPath.size > MAX_TRACKED_ROOT_PATHS) {
        const oldestRootPath = lastInactiveAtByRootPath.keys().next().value;
        if (typeof oldestRootPath === 'string') {
          lastInactiveAtByRootPath.delete(oldestRootPath);
        }
      }
    },
    getLastInactiveAt(rootPath) {
      return lastInactiveAtByRootPath.get(rootPath) ?? null;
    },
    clear(rootPath) {
      lastInactiveAtByRootPath.delete(rootPath);
    },
    reset() {
      lastInactiveAtByRootPath.clear();
    },
  };
}

export const fileTreeRootQueryRemountTracker = createFileTreeRootQueryRemountTracker();
