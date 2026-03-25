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
  const immediateReloadPaths =
    activeTabPath && tabs.some((tab) => tab.path === activeTabPath) ? [activeTabPath] : [];
  const stalePaths = tabs
    .map((tab) => tab.path)
    .filter((path) => !immediateReloadPaths.includes(path));

  return {
    immediateReloadPaths,
    stalePaths,
  };
}
