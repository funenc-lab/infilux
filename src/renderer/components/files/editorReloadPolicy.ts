import { normalizePath } from '@/App/storage';

interface ReloadableEditorTab {
  path: string;
  isDirty: boolean;
}

export interface BulkReloadPlan {
  immediateReloadPaths: string[];
  stalePaths: string[];
}

export interface ExternalReloadBatchPlan {
  reloadPaths: string[];
}

function buildCanonicalTabPathMap(tabs: ReloadableEditorTab[]): Map<string, string> {
  const canonicalTabPaths = new Map<string, string>();
  for (const tab of tabs) {
    const normalizedPath = normalizePath(tab.path);
    if (!canonicalTabPaths.has(normalizedPath)) {
      canonicalTabPaths.set(normalizedPath, tab.path);
    }
  }
  return canonicalTabPaths;
}

export function buildBulkReloadPlan(
  tabs: ReloadableEditorTab[],
  activeTabPath: string | null
): BulkReloadPlan {
  const canonicalTabPaths = buildCanonicalTabPathMap(tabs);

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

export function buildExternalReloadBatchPlan(
  tabs: ReloadableEditorTab[],
  changedPaths: string[]
): ExternalReloadBatchPlan {
  const canonicalTabPaths = buildCanonicalTabPathMap(tabs);
  const reloadPaths: string[] = [];
  const seen = new Set<string>();

  for (const changedPath of changedPaths) {
    const normalizedPath = normalizePath(changedPath);
    if (seen.has(normalizedPath)) {
      continue;
    }

    seen.add(normalizedPath);
    const canonicalPath = canonicalTabPaths.get(normalizedPath);
    if (canonicalPath) {
      reloadPaths.push(canonicalPath);
    }
  }

  return {
    reloadPaths,
  };
}
