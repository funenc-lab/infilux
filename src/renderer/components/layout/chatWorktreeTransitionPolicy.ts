import type { TabId } from '@/App/constants';
import { pathsEqual } from '@/App/storage';
import type { WorktreeAgentSessionRecoveryStatus } from '@/components/chat/agentSessionRecovery';
import type { AgentSessionDisplayMode } from '@/stores/settings';
import type { MainContentContext } from './mainContentContextPolicy';

interface ResolveVisibleChatBridgeContextOptions {
  activeTab: TabId;
  agentSessionDisplayMode: AgentSessionDisplayMode;
  currentChatSessionCount: number;
  currentContext: MainContentContext | null;
  hasActiveWorktree: boolean;
  lastVisibleChatContext: MainContentContext | null;
  recoveryStatus: WorktreeAgentSessionRecoveryStatus;
  shouldRenderCurrentChatPanel: boolean;
  showSubagentTranscript: boolean;
}

export function resolveVisibleChatBridgeContext({
  activeTab,
  agentSessionDisplayMode,
  currentChatSessionCount,
  currentContext,
  hasActiveWorktree,
  lastVisibleChatContext,
  recoveryStatus,
  shouldRenderCurrentChatPanel,
  showSubagentTranscript,
}: ResolveVisibleChatBridgeContextOptions): MainContentContext | null {
  if (
    activeTab !== 'chat' ||
    agentSessionDisplayMode === 'global-canvas' ||
    showSubagentTranscript ||
    !shouldRenderCurrentChatPanel ||
    !hasActiveWorktree ||
    !currentContext ||
    currentChatSessionCount > 0 ||
    recoveryStatus !== 'restoring' ||
    !lastVisibleChatContext
  ) {
    return null;
  }

  if (pathsEqual(lastVisibleChatContext.worktreePath, currentContext.worktreePath)) {
    return null;
  }

  return lastVisibleChatContext;
}
