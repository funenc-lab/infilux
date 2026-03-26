import type { TabId } from '@/App/constants';
import type { FileTreeDisplayMode } from '@/stores/settings';

interface AutoExpandFileSidebarOptions {
  activeTab: TabId;
  previousActiveTab: TabId | null;
  fileTreeDisplayMode: FileTreeDisplayMode;
  hasActiveWorktree: boolean;
  isFileSidebarCollapsed: boolean;
  worktreePath: string | null;
  previousWorktreePath: string | null;
  activeFilePath?: string | null;
  previousActiveFilePath?: string | null;
}

interface AutoExpandIntegratedFileTreeOptions {
  isActive: boolean;
  previousIsActive: boolean;
  isFileTreeCollapsed: boolean;
  rootPath: string | undefined;
  previousRootPath: string | undefined;
  activeFilePath?: string | null;
  previousActiveFilePath?: string | null;
}

export function shouldAutoExpandFileSidebar({
  activeTab,
  previousActiveTab,
  fileTreeDisplayMode,
  hasActiveWorktree,
  isFileSidebarCollapsed,
  worktreePath,
  previousWorktreePath,
  activeFilePath,
  previousActiveFilePath,
}: AutoExpandFileSidebarOptions): boolean {
  if (fileTreeDisplayMode !== 'current') {
    return false;
  }

  if (!hasActiveWorktree || !isFileSidebarCollapsed || activeTab !== 'file') {
    return false;
  }

  return (
    previousActiveTab !== 'file' ||
    previousWorktreePath !== worktreePath ||
    previousActiveFilePath !== activeFilePath
  );
}

export function shouldAutoExpandIntegratedFileTree({
  isActive,
  previousIsActive,
  isFileTreeCollapsed,
  rootPath,
  previousRootPath,
  activeFilePath,
  previousActiveFilePath,
}: AutoExpandIntegratedFileTreeOptions): boolean {
  if (!rootPath || !isFileTreeCollapsed || !isActive) {
    return false;
  }

  return (
    !previousIsActive || previousRootPath !== rootPath || previousActiveFilePath !== activeFilePath
  );
}
