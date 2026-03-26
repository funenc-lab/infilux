import type { TabId } from '@/App/constants';

export type RetainedPanelTabId = 'chat' | 'file' | 'terminal';

interface PanelRetentionOptions {
  tabId: RetainedPanelTabId;
  activeTab: TabId;
  agentSessionCount?: number;
  terminalCount?: number;
  fileTabCount?: number;
}

export function shouldRetainPanel({
  tabId,
  activeTab,
  agentSessionCount = 0,
  terminalCount = 0,
  fileTabCount = 0,
}: PanelRetentionOptions): boolean {
  if (activeTab === tabId) {
    return true;
  }

  switch (tabId) {
    case 'chat':
      return agentSessionCount > 0;
    case 'terminal':
      return terminalCount > 0;
    case 'file':
      return fileTabCount > 0;
    default:
      return false;
  }
}
