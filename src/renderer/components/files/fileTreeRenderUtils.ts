const FILE_TREE_ROW_VIEWPORT_STYLE = Object.freeze({
  contentVisibility: 'auto' as const,
  containIntrinsicSize: '28px',
});

export function getFileTreeRowViewportStyle() {
  return FILE_TREE_ROW_VIEWPORT_STYLE;
}

export function isPathInSubtree(path: string | null, subtreePath: string): boolean {
  if (!path) {
    return false;
  }

  return path === subtreePath || path.startsWith(`${subtreePath}/`);
}

export function didPathChangeAffectSubtree(
  previousPath: string | null,
  nextPath: string | null,
  subtreePath: string
): boolean {
  return (
    previousPath !== nextPath &&
    (isPathInSubtree(previousPath, subtreePath) || isPathInSubtree(nextPath, subtreePath))
  );
}

function hasRelevantExpansionDelta(
  source: Set<string>,
  target: Set<string>,
  subtreePath: string
): boolean {
  const subtreePrefix = `${subtreePath}/`;

  for (const path of source) {
    if (target.has(path)) {
      continue;
    }

    if (path === subtreePath || path.startsWith(subtreePrefix)) {
      return true;
    }
  }

  return false;
}

export function didExpansionChangeAffectSubtree(
  previousExpandedPaths: Set<string>,
  nextExpandedPaths: Set<string>,
  subtreePath: string
): boolean {
  if (previousExpandedPaths === nextExpandedPaths) {
    return false;
  }

  return (
    hasRelevantExpansionDelta(previousExpandedPaths, nextExpandedPaths, subtreePath) ||
    hasRelevantExpansionDelta(nextExpandedPaths, previousExpandedPaths, subtreePath)
  );
}
