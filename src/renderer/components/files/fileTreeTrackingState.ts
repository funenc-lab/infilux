import type { TabId } from '@/App/constants';

interface InitialFileSidebarTrackingState {
  activeTab: TabId | null;
  worktreePath: string | null;
  activeFilePath: string | null;
}

interface InitialFilePanelTrackingState {
  isActive: boolean;
  rootPath: string | undefined;
  activeFilePath: string | null;
}

export function createInitialFileSidebarTrackingState(): InitialFileSidebarTrackingState {
  return {
    activeTab: null,
    worktreePath: null,
    activeFilePath: null,
  };
}

export function createInitialFilePanelTrackingState(): InitialFilePanelTrackingState {
  return {
    isActive: false,
    rootPath: undefined,
    activeFilePath: null,
  };
}
