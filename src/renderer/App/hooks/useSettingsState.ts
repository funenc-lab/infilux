import { useCallback, useEffect, useRef, useState } from 'react';
import type { SettingsCategory } from '@/components/settings/constants';
import { useSettingsStore } from '@/stores/settings';
import type { TabId } from '../constants';
import { resolveWorktreeTabForPersistence } from '../settingsWorktreeTabPolicy';

export function useSettingsState(
  activeTab: TabId,
  previousTab: TabId | null,
  setActiveTab: (tab: TabId) => void,
  setPreviousTab: (tab: TabId | null) => void,
  persistCurrentWorktreeTab: (tab: TabId) => void
) {
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategory>(() => {
    try {
      const saved = localStorage.getItem('enso-settings-active-category');
      const validCategories: SettingsCategory[] = [
        'general',
        'appearance',
        'editor',
        'keybindings',
        'agent',
        'ai',
        'input',
        'integration',
        'hapi',
        'remote',
        'webInspector',
      ];
      return saved && validCategories.includes(saved as SettingsCategory)
        ? (saved as SettingsCategory)
        : 'general';
    } catch {
      return 'general';
    }
  });
  const [scrollToProvider, setScrollToProvider] = useState(false);
  const [pendingProviderAction, setPendingProviderAction] = useState<'preview' | 'save' | null>(
    null
  );
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);

  const settingsDisplayMode = useSettingsStore((s) => s.settingsDisplayMode);
  const prevSettingsDisplayModeRef = useRef<typeof settingsDisplayMode | null>(null);
  const persistResolvedWorktreeTab = useCallback(() => {
    persistCurrentWorktreeTab(
      resolveWorktreeTabForPersistence({
        activeTab,
        previousTab,
        settingsDisplayMode,
      })
    );
  }, [activeTab, previousTab, settingsDisplayMode, persistCurrentWorktreeTab]);

  // Persist settings category
  useEffect(() => {
    try {
      localStorage.setItem('enso-settings-active-category', settingsCategory);
    } catch (error) {
      console.warn('Failed to save settings category:', error);
    }
  }, [settingsCategory]);

  const openSettings = useCallback(() => {
    if (settingsDisplayMode === 'tab') {
      if (activeTab !== 'settings') {
        setPreviousTab(activeTab);
        setActiveTab('settings');
      }
    } else {
      setSettingsDialogOpen(true);
    }
  }, [settingsDisplayMode, activeTab, setActiveTab, setPreviousTab]);

  const toggleSettings = useCallback(() => {
    if (settingsDisplayMode === 'tab') {
      if (activeTab === 'settings') {
        setActiveTab(previousTab || 'chat');
        setPreviousTab(null);
      } else {
        setPreviousTab(activeTab);
        setActiveTab('settings');
      }
    } else {
      const nextOpen = !settingsDialogOpen;
      setSettingsDialogOpen(nextOpen);
      if (!nextOpen) {
        persistResolvedWorktreeTab();
      }
    }
  }, [
    settingsDisplayMode,
    activeTab,
    previousTab,
    settingsDialogOpen,
    persistResolvedWorktreeTab,
    setActiveTab,
    setPreviousTab,
  ]);

  const handleSettingsCategoryChange = useCallback((category: SettingsCategory) => {
    setSettingsCategory(category);
  }, []);

  const handleSettingsDialogOpenChange = useCallback(
    (open: boolean) => {
      setSettingsDialogOpen(open);
      if (!open && settingsDisplayMode === 'draggable-modal') {
        persistResolvedWorktreeTab();
      }
    },
    [persistResolvedWorktreeTab, settingsDisplayMode]
  );

  // Clean up settings state when display mode changes
  useEffect(() => {
    const prevMode = prevSettingsDisplayModeRef.current;
    prevSettingsDisplayModeRef.current = settingsDisplayMode;

    if (prevMode === null || prevMode === settingsDisplayMode) {
      return;
    }

    if (settingsDisplayMode === 'tab') {
      setSettingsDialogOpen(false);
      if (activeTab !== 'settings') {
        setPreviousTab(activeTab);
        setActiveTab('settings');
      }
    } else {
      if (activeTab === 'settings') {
        const restoredTab = resolveWorktreeTabForPersistence({
          activeTab,
          previousTab,
          settingsDisplayMode,
        });
        setActiveTab(restoredTab);
        setPreviousTab(null);
        persistCurrentWorktreeTab(restoredTab);
      }
      setSettingsDialogOpen(true);
    }
  }, [
    settingsDisplayMode,
    activeTab,
    previousTab,
    persistCurrentWorktreeTab,
    setActiveTab,
    setPreviousTab,
  ]);

  return {
    settingsCategory,
    scrollToProvider,
    pendingProviderAction,
    settingsDialogOpen,
    settingsDisplayMode,
    setSettingsCategory,
    setScrollToProvider,
    setPendingProviderAction,
    setSettingsDialogOpen,
    openSettings,
    toggleSettings,
    handleSettingsCategoryChange,
    handleSettingsDialogOpenChange,
  };
}
