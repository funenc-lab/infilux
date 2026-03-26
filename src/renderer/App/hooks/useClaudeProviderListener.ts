import { useEffect, useRef } from 'react';
import type { SettingsCategory } from '@/components/settings/constants';
import { addToast, toastManager } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { consumeClaudeProviderSwitch, isClaudeProviderMatch } from '@/lib/claudeProvider';
import { buildSettingsWorkflowToastCopy } from '@/lib/feedbackCopy';
import { useSettingsStore } from '@/stores/settings';

export function useClaudeProviderListener(
  setSettingsCategory: (category: SettingsCategory) => void,
  setScrollToProvider: (scroll: boolean) => void,
  openSettings: () => void,
  setPendingProviderAction: (action: 'preview' | 'save' | null) => void
) {
  const { t } = useI18n();
  const claudeProviders = useSettingsStore((s) => s.claudeCodeIntegration.providers);
  const enableProviderWatcher = useSettingsStore(
    (s) => s.claudeCodeIntegration.enableProviderWatcher ?? true
  );
  const providerToastRef = useRef<ReturnType<typeof toastManager.add> | null>(null);

  useEffect(() => {
    const cleanup = window.electronAPI.claudeProvider.onSettingsChanged((data) => {
      // Skip if provider watcher is disabled
      if (!enableProviderWatcher) return;

      const { extracted } = data;
      if (!extracted?.baseUrl) return;

      if (consumeClaudeProviderSwitch(extracted)) {
        return;
      }

      // Close previous provider toast if exists
      if (providerToastRef.current) {
        toastManager.close(providerToastRef.current);
      }

      // Check if the new config matches any saved provider
      const matched = claudeProviders.find((p) => isClaudeProviderMatch(p, extracted));

      if (matched) {
        // Switched to a known provider
        const copy = buildSettingsWorkflowToastCopy(
          {
            action: 'provider-switch',
            phase: 'success',
            name: matched.name,
          },
          t
        );
        providerToastRef.current = toastManager.add({
          type: 'info',
          title: copy.title,
          description: copy.description,
        });
      } else {
        // New unsaved config detected
        const copy = buildSettingsWorkflowToastCopy(
          {
            action: 'provider-detected',
            phase: 'info',
          },
          t
        );
        providerToastRef.current = addToast({
          type: 'info',
          title: copy.title,
          description: copy.description,
          actions: [
            {
              label: t('Preview'),
              onClick: () => {
                setSettingsCategory('integration');
                setScrollToProvider(true);
                openSettings();
                setPendingProviderAction('preview');
              },
              variant: 'ghost',
            },
            {
              label: t('Save'),
              onClick: () => {
                setSettingsCategory('integration');
                setScrollToProvider(true);
                openSettings();
                setPendingProviderAction('save');
              },
              variant: 'outline',
            },
            {
              label: t('Open Settings'),
              onClick: () => {
                setSettingsCategory('integration');
                setScrollToProvider(true);
                openSettings();
              },
            },
          ],
        });
      }
    });

    return () => {
      if (providerToastRef.current) {
        toastManager.close(providerToastRef.current);
        providerToastRef.current = null;
      }
      cleanup();
    };
  }, [
    claudeProviders,
    t,
    openSettings,
    setSettingsCategory,
    setScrollToProvider,
    setPendingProviderAction,
    enableProviderWatcher,
  ]);
}
