import type { FileTreeDisplayMode } from '@/stores/settings';

interface ResolveFileSidebarVisibilityOptions {
  fileTreeDisplayMode: FileTreeDisplayMode;
  activeWorktreePath: string | null;
  editorWorktreePath: string | null;
  activeFilePath?: string | null;
  candidateWorktreePaths?: string[];
}

interface FileSidebarVisibilityResult {
  shouldRender: boolean;
  rootPath: string | null;
}

export function resolveFileSidebarVisibility({
  fileTreeDisplayMode,
  activeWorktreePath,
  editorWorktreePath,
  activeFilePath,
  candidateWorktreePaths = [],
}: ResolveFileSidebarVisibilityOptions): FileSidebarVisibilityResult {
  if (fileTreeDisplayMode !== 'current') {
    return {
      shouldRender: false,
      rootPath: null,
    };
  }

  const recoveredWorktreePath =
    !activeWorktreePath && !editorWorktreePath && activeFilePath
      ? ([...candidateWorktreePaths]
          .sort((left, right) => right.length - left.length)
          .find(
            (candidatePath) =>
              activeFilePath === candidatePath || activeFilePath.startsWith(`${candidatePath}/`)
          ) ?? null)
      : null;

  const rootPath = activeWorktreePath ?? editorWorktreePath ?? recoveredWorktreePath;

  return {
    shouldRender: Boolean(rootPath),
    rootPath,
  };
}
