import type { TabId } from '@/App/constants';
import { normalizePath } from '@/App/storage';

interface RetainedChatContext {
  repoPath: string;
  worktreePath: string;
}

export interface MainContentChatPanelEntry {
  isActive: boolean;
  isCurrent: boolean;
  isVisible: boolean;
  repoPath: string;
  showFallback: boolean;
  worktreePath: string;
}

interface ResolveMainContentChatPanelPlanOptions {
  activeTab: TabId;
  cachedChatPanelPaths: string[];
  getRepoPathForWorktree: (worktreePath: string) => string | null;
  hasActiveWorktree: boolean;
  retainedChatContext: RetainedChatContext | null;
  shouldRenderCurrentChatPanel: boolean;
  showSubagentTranscript: boolean;
}

export function resolveMainContentChatPanelPlan({
  activeTab,
  cachedChatPanelPaths,
  getRepoPathForWorktree,
  hasActiveWorktree,
  retainedChatContext,
  shouldRenderCurrentChatPanel,
  showSubagentTranscript,
}: ResolveMainContentChatPanelPlanOptions): MainContentChatPanelEntry[] {
  const currentWorktreePath = shouldRenderCurrentChatPanel
    ? (retainedChatContext?.worktreePath ?? null)
    : null;
  const currentRepoPath = shouldRenderCurrentChatPanel
    ? (retainedChatContext?.repoPath ?? null)
    : null;
  const currentWorktreeKey = currentWorktreePath ? normalizePath(currentWorktreePath) : null;
  const visibleCurrentPanel = activeTab === 'chat' && !showSubagentTranscript;
  const seenPaths = new Set<string>();
  const entries: MainContentChatPanelEntry[] = [];

  for (const worktreePath of [
    ...(currentWorktreePath ? [currentWorktreePath] : []),
    ...cachedChatPanelPaths,
  ]) {
    const normalizedPath = normalizePath(worktreePath);
    if (seenPaths.has(normalizedPath)) {
      continue;
    }
    seenPaths.add(normalizedPath);

    const isCurrent = currentWorktreeKey === normalizedPath;
    const repoPath = isCurrent ? currentRepoPath : getRepoPathForWorktree(worktreePath);
    if (!repoPath) {
      continue;
    }

    entries.push({
      repoPath,
      worktreePath,
      isCurrent,
      isVisible: isCurrent && visibleCurrentPanel,
      isActive: isCurrent && visibleCurrentPanel && hasActiveWorktree,
      showFallback: isCurrent && visibleCurrentPanel,
    });
  }

  return entries;
}
