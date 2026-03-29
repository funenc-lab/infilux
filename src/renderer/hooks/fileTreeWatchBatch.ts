export interface FileTreeWatchEvent {
  type: 'create' | 'update' | 'delete';
  path: string;
}

export interface FileTreeWatchRefreshPlan {
  shouldRefetchRoot: boolean;
  invalidateQueryPaths: string[];
  refreshNodePaths: string[];
}

function getParentPath(path: string, rootPath: string): string {
  const lastSeparatorIndex = path.lastIndexOf('/');
  if (lastSeparatorIndex <= 0) {
    return rootPath;
  }

  return path.slice(0, lastSeparatorIndex) || rootPath;
}

export function buildFileTreeWatchRefreshPlan(options: {
  rootPath: string;
  expandedPaths: Set<string>;
  events: FileTreeWatchEvent[];
}): FileTreeWatchRefreshPlan {
  const { rootPath, expandedPaths, events } = options;
  const invalidateQueryPaths = new Set<string>();
  const refreshNodePaths = new Set<string>();
  let shouldRefetchRoot = false;

  for (const event of events) {
    const parentPath = getParentPath(event.path, rootPath);

    if (parentPath === rootPath) {
      shouldRefetchRoot = true;
    } else {
      invalidateQueryPaths.add(parentPath);
      if (expandedPaths.has(parentPath)) {
        refreshNodePaths.add(parentPath);
      }
    }

    if (expandedPaths.has(event.path)) {
      refreshNodePaths.add(event.path);
    }
  }

  return {
    shouldRefetchRoot,
    invalidateQueryPaths: [...invalidateQueryPaths],
    refreshNodePaths: [...refreshNodePaths],
  };
}
