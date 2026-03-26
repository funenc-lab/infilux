import { normalizePath } from '@/App/storage';

interface ReloadableEditorTab {
  path: string;
  isDirty: boolean;
}

export interface BulkReloadPlan {
  immediateReloadPaths: string[];
  stalePaths: string[];
}

export function buildBulkReloadPlan(
  tabs: ReloadableEditorTab[],
  activeTabPath: string | null
): BulkReloadPlan {
  const canonicalTabPaths = new Map<string, string>();
  for (const tab of tabs) {
    const normalizedPath = normalizePath(tab.path);
    if (!canonicalTabPaths.has(normalizedPath)) {
      canonicalTabPaths.set(normalizedPath, tab.path);
    }
  }

  const normalizedActiveTabPath = activeTabPath ? normalizePath(activeTabPath) : null;
  const immediateReloadPaths =
    normalizedActiveTabPath && canonicalTabPaths.has(normalizedActiveTabPath)
      ? [canonicalTabPaths.get(normalizedActiveTabPath)!]
      : [];
  const stalePaths = [...canonicalTabPaths.entries()]
    .filter(([normalizedPath]) => normalizedPath !== normalizedActiveTabPath)
    .map(([, path]) => path);

  return {
    immediateReloadPaths,
    stalePaths,
  };
}
