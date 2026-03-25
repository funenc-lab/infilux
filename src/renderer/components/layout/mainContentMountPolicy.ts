import type { TabId } from '@/App/constants';

const KEEP_MOUNTED_TABS = new Set<TabId>(['chat', 'file', 'terminal']);

export function shouldKeepMountedTab(tabId: TabId): boolean {
  return KEEP_MOUNTED_TABS.has(tabId);
}

export function shouldRenderTabPanel(tabId: TabId, activeTab: TabId): boolean {
  return activeTab === tabId || shouldKeepMountedTab(tabId);
}
