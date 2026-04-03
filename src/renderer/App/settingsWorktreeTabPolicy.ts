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
}: ResolveWorktreeTabForRestoreOptions): TabId {
  const restoredTab = savedTab ?? fallbackTab;

  if (settingsDisplayMode === 'draggable-modal' && restoredTab === 'settings') {
    return fallbackTab;
  }

  return restoredTab;
}
