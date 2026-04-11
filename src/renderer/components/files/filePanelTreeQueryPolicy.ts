interface FilePanelTreeQueryOptions {
  hasRootPath: boolean;
  treeEnabled: boolean;
}

export function shouldEnableFilePanelTreeQuery({
  hasRootPath,
  treeEnabled,
}: FilePanelTreeQueryOptions): boolean {
  return hasRootPath && treeEnabled;
}
