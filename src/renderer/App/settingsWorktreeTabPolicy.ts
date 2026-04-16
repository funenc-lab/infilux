import type { SettingsDisplayMode } from '@/stores/settings';
import type { TabId } from './constants';

interface ResolveWorktreeTabForPersistenceOptions {
  activeTab: TabId;
  previousTab: TabId | null;
  settingsDisplayMode: SettingsDisplayMode;
}

interface ResolveWorktreeTabForRestoreOptions {
  savedTab?: TabId;
  settingsDisplayMode: SettingsDisplayMode;
  fallbackTab?: Exclude<TabId, 'settings'>;
  allowFileTabRestore?: boolean;
}

export function resolveWorktreeTabForPersistence({
  activeTab,
  previousTab,
  settingsDisplayMode,
}: ResolveWorktreeTabForPersistenceOptions): TabId {
  if (settingsDisplayMode === 'draggable-modal' && activeTab === 'settings') {
    return previousTab ?? 'chat';
  }

  return activeTab;
}

export function resolveWorktreeTabForRestore({
  savedTab,
  settingsDisplayMode,
  fallbackTab = 'chat',
  allowFileTabRestore = true,
}: ResolveWorktreeTabForRestoreOptions): TabId {
  const restoredTab = savedTab ?? fallbackTab;

  if (settingsDisplayMode === 'draggable-modal' && restoredTab === 'settings') {
    return fallbackTab;
  }

  if (!allowFileTabRestore && restoredTab === 'file') {
    return fallbackTab;
  }

  return restoredTab;
}
