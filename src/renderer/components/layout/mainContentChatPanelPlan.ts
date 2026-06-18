import type { TabId } from '@/App/constants';
import { normalizePath } from '@/App/storage';
import type { AgentSessionDisplayMode } from '@/stores/settings';
import type { MainContentContext } from './mainContentContextPolicy';

export interface MainContentChatPanelEntry {
  isActive: boolean;
  isCurrent: boolean;
  isVisible: boolean;
  repoPath: string;
  showFallback: boolean;
  worktreePath: string;
}

export function resolveMainContentChatPanelEntryKey(
  entry: MainContentChatPanelEntry,
  agentSessionDisplayMode: AgentSessionDisplayMode
): string {
  if (agentSessionDisplayMode === 'global-canvas' && entry.isCurrent) {
    return 'chat:workspace:all';
  }

  return `chat:${entry.worktreePath}`;
}

interface ResolveMainContentChatPanelPlanOptions {
  activeTab: TabId;
  agentSessionDisplayMode: AgentSessionDisplayMode;
  cachedChatPanelPaths: string[];
  getRepoPathForWorktree: (worktreePath: string) => string | null;
  hasActiveWorktree: boolean;
  retainedChatContext: MainContentContext | null;
  shouldRenderCurrentChatPanel: boolean;
  showSubagentTranscript: boolean;
}

export function resolveMainContentChatPanelPlan({
  activeTab,
  agentSessionDisplayMode,
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
  const visibleWorktreePath = visibleCurrentPanel ? currentWorktreePath : null;
  const visibleWorktreeKey = visibleWorktreePath ? normalizePath(visibleWorktreePath) : null;
  const seenPaths = new Set<string>();
  const entries: MainContentChatPanelEntry[] = [];
  const plannedWorktreePaths =
    agentSessionDisplayMode === 'global-canvas'
      ? [...(currentWorktreePath ? [currentWorktreePath] : [])]
      : [...(currentWorktreePath ? [currentWorktreePath] : []), ...cachedChatPanelPaths];

  for (const worktreePath of plannedWorktreePaths) {
    const normalizedPath = normalizePath(worktreePath);
    if (seenPaths.has(normalizedPath)) {
      continue;
    }
    seenPaths.add(normalizedPath);

    const isCurrent = currentWorktreeKey === normalizedPath;
    const isVisible = visibleCurrentPanel && visibleWorktreeKey === normalizedPath;
    const repoPath = isCurrent ? currentRepoPath : getRepoPathForWorktree(worktreePath);
    if (!repoPath) {
      continue;
    }

    entries.push({
      repoPath,
      worktreePath,
      isCurrent,
      isVisible,
      isActive: isVisible && hasActiveWorktree,
      showFallback: isCurrent && isVisible,
    });
  }

  return entries;
}
