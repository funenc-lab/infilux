import { useEffect } from 'react';
import { useEditor } from '@/hooks/useEditor';
import { type FileNavigationRequest, useNavigationStore } from '@/stores/navigation';
import type { TabId } from '../constants';

interface ApplyTerminalNavigationOptions {
  activeWorktreePath: string | null;
  pendingNavigation: FileNavigationRequest | null;
  navigateToFile: (
    path: string,
    line?: number,
    column?: number,
    matchLength?: number,
    previewMode?: 'off' | 'split' | 'fullscreen'
  ) => void;
  setActiveTab: (tab: TabId) => void;
  setWorktreeTabMap: (fn: (prev: Record<string, TabId>) => Record<string, TabId>) => void;
  clearNavigation: () => void;
}

export function applyTerminalNavigation({
  activeWorktreePath,
  pendingNavigation,
  navigateToFile,
  setActiveTab,
  setWorktreeTabMap,
  clearNavigation,
}: ApplyTerminalNavigationOptions): boolean {
  if (!pendingNavigation) {
    return false;
  }

  const { path, line, column, previewMode } = pendingNavigation;

  navigateToFile(path, line, column, undefined, previewMode);
  setActiveTab('file');

  if (activeWorktreePath) {
    setWorktreeTabMap((prev) => ({
      ...prev,
      [activeWorktreePath]: 'file',
    }));
  }

  clearNavigation();
  return true;
}

export function useTerminalNavigation(
  activeWorktreePath: string | null,
  setActiveTab: (tab: TabId) => void,
  setWorktreeTabMap: (fn: (prev: Record<string, TabId>) => Record<string, TabId>) => void
) {
  const { pendingNavigation, clearNavigation } = useNavigationStore();
  const { navigateToFile } = useEditor();

  useEffect(() => {
    applyTerminalNavigation({
      activeWorktreePath,
      pendingNavigation,
      navigateToFile,
      setActiveTab,
      setWorktreeTabMap,
      clearNavigation,
    });
  }, [
    pendingNavigation,
    navigateToFile,
    clearNavigation,
    activeWorktreePath,
    setActiveTab,
    setWorktreeTabMap,
  ]);
}
