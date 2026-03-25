import type { TempWorkspaceItem } from '@shared/types';

function normalizeComparisonPath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  return process.platform === 'win32' || process.platform === 'darwin'
    ? normalized.toLowerCase()
    : normalized;
}

export function normalizeStoredTempWorkspacePath(rawPath: string): string {
  const trimmedPath = rawPath.trim();
  if (!trimmedPath) {
    return trimmedPath;
  }

  const normalizedPath = trimmedPath.replace(/\\/g, '/');
  const nestedAbsoluteIndex = normalizedPath.indexOf('//');
  if (nestedAbsoluteIndex > 0 && normalizedPath[nestedAbsoluteIndex + 2] !== '/') {
    return `/${normalizedPath.slice(nestedAbsoluteIndex + 2).replace(/^\/+/, '')}`;
  }

  const nestedWindowsMatch = normalizedPath.match(/^[A-Za-z]:\/.*?\/([A-Za-z]:\/.*)$/);
  if (nestedWindowsMatch?.[1]) {
    return nestedWindowsMatch[1];
  }

  return trimmedPath;
}

export function normalizeStoredTempWorkspaceItems(items: TempWorkspaceItem[]): TempWorkspaceItem[] {
  const normalizedItems: TempWorkspaceItem[] = [];
  const seenPaths = new Set<string>();

  for (const item of items) {
    const normalizedPath = normalizeStoredTempWorkspacePath(item.path);
    if (!normalizedPath) {
      continue;
    }

    const comparisonPath = normalizeComparisonPath(normalizedPath);
    if (seenPaths.has(comparisonPath)) {
      continue;
    }

    seenPaths.add(comparisonPath);
    normalizedItems.push({
      ...item,
      path: normalizedPath,
    });
  }

  return normalizedItems;
}
