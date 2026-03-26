import type { TabId } from '@/App/constants';
import { normalizePath } from '@/App/storage';
import { shouldRetainPanel } from './panelRetentionPolicy';

interface MainContentRenderPlanOptions {
  activeTab: TabId;
  effectiveWorktreePath?: string | null;
  retainedChatPanelPaths: string[];
  retainedTerminalPanelPaths: string[];
  retainedFilePanelPaths: string[];
  hasCurrentChatActivity: boolean;
  hasCurrentTerminalActivity: boolean;
  currentFileTabCount: number;
}

function dedupePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const path of paths) {
    const normalizedPath = normalizePath(path);
    if (seen.has(normalizedPath)) {
      continue;
    }

    seen.add(normalizedPath);
    deduped.push(path);
  }

  return deduped;
}

function excludeCurrentWorktree(paths: string[], effectiveWorktreePath?: string | null): string[] {
  const dedupedPaths = dedupePaths(paths);

  if (!effectiveWorktreePath) {
    return dedupedPaths;
  }

  const normalizedCurrentPath = normalizePath(effectiveWorktreePath);
  return dedupedPaths.filter((path) => normalizePath(path) !== normalizedCurrentPath);
}

export function buildMainContentRenderPlan({
  activeTab,
  effectiveWorktreePath,
  retainedChatPanelPaths,
  retainedTerminalPanelPaths,
  retainedFilePanelPaths,
  hasCurrentChatActivity,
  hasCurrentTerminalActivity,
  currentFileTabCount,
}: MainContentRenderPlanOptions) {
  return {
    shouldRenderCurrentChatPanel: shouldRetainPanel({
      tabId: 'chat',
      activeTab,
      agentSessionCount: hasCurrentChatActivity ? 1 : 0,
    }),
    shouldRenderCurrentTerminalPanel: shouldRetainPanel({
      tabId: 'terminal',
      activeTab,
      terminalCount: hasCurrentTerminalActivity ? 1 : 0,
    }),
    shouldRenderCurrentFilePanel: shouldRetainPanel({
      tabId: 'file',
      activeTab,
      fileTabCount: currentFileTabCount,
    }),
    cachedChatPanelPaths: excludeCurrentWorktree(retainedChatPanelPaths, effectiveWorktreePath),
    cachedTerminalPanelPaths: excludeCurrentWorktree(
      retainedTerminalPanelPaths,
      effectiveWorktreePath
    ),
    cachedFilePanelPaths: excludeCurrentWorktree(retainedFilePanelPaths, effectiveWorktreePath),
  };
}
