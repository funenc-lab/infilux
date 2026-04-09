import type { TabId } from '@/App/constants';
import { DEFAULT_CHAT_PANEL_INACTIVITY_THRESHOLD_MINUTES } from '@/stores/settings/chatPanelInactivityThresholdPolicy';

export type RetainedPanelTabId = 'chat' | 'file' | 'terminal';
export type ChatPanelRetentionState = 'cold' | 'warm' | 'hot';
export const CHAT_PANEL_INACTIVITY_THRESHOLD_MS =
  DEFAULT_CHAT_PANEL_INACTIVITY_THRESHOLD_MINUTES * 60 * 1000;

interface ResolveChatPanelRetentionStateOptions {
  sessionCount: number;
  hasAttentionSignal?: boolean;
  hasLiveActivity?: boolean;
  latestActivityAt?: number | null;
  now?: number;
  inactivityThresholdMs?: number;
}

interface PanelRetentionOptions {
  tabId: RetainedPanelTabId;
  activeTab: TabId;
  chatRetentionState?: ChatPanelRetentionState;
  agentSessionCount?: number;
  terminalCount?: number;
  fileTabCount?: number;
}

export function resolveChatPanelRetentionState({
  sessionCount,
  hasAttentionSignal = false,
  hasLiveActivity = false,
  latestActivityAt = null,
  now = Date.now(),
  inactivityThresholdMs = CHAT_PANEL_INACTIVITY_THRESHOLD_MS,
}: ResolveChatPanelRetentionStateOptions): ChatPanelRetentionState {
  if (hasLiveActivity || hasAttentionSignal) {
    return 'hot';
  }

  if (sessionCount <= 0) {
    return 'cold';
  }

  if (latestActivityAt === null) {
    return 'warm';
  }

  if (typeof latestActivityAt === 'number' && now - latestActivityAt <= inactivityThresholdMs) {
    return 'warm';
  }

  return 'cold';
}

export function shouldRetainPanel({
  tabId,
  activeTab,
  chatRetentionState,
  agentSessionCount = 0,
  terminalCount = 0,
  fileTabCount = 0,
}: PanelRetentionOptions): boolean {
  if (activeTab === tabId) {
    return true;
  }

  switch (tabId) {
    case 'chat':
      return chatRetentionState ? chatRetentionState !== 'cold' : agentSessionCount > 0;
    case 'terminal':
      return terminalCount > 0;
    case 'file':
      return fileTabCount > 0;
    default:
      return false;
  }
}
