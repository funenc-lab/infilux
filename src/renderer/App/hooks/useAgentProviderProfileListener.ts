import { useEffect, useRef } from 'react';
import { buildAgentProviderDetectionState } from '@/components/settings/agent-provider/providerListModel';
import type { SettingsCategory } from '@/components/settings/constants';
import { addToast, toastManager } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import {
  agentProviderProfileAdapter,
  getAgentProviderProfileAdapter,
} from '@/lib/agentProviderProfiles';
import { buildSettingsWorkflowToastCopy } from '@/lib/feedbackCopy';
import { useSettingsStore } from '@/stores/settings';
import type { PendingProviderAction } from './useSettingsState';

export function useAgentProviderProfileListener(
  setSettingsCategory: (category: SettingsCategory) => void,
  setScrollToProvider: (scroll: boolean) => void,
  openSettings: () => void,
  setPendingProviderAction: (action: PendingProviderAction) => void
) {
  const { t } = useI18n();
  const agentProviders = useSettingsStore((s) => s.agentIntegration.providers);
  const enableProviderWatcher = useSettingsStore(
    (s) => s.agentIntegration.enableProviderWatcher ?? true
  );
  const providerToastRef = useRef<ReturnType<typeof toastManager.add> | null>(null);

  useEffect(() => {
    const cleanup = agentProviderProfileAdapter.subscribeToExternalChanges(undefined, (data) => {
      // Skip if provider watcher is disabled
      if (!enableProviderWatcher) return;

      const { extracted } = data;
      const providerId = data.providerId ?? extracted?.providerId;
      const detected = data.detected ?? Boolean(extracted?.baseUrl);
      if (!providerId || !detected) return;

      if (agentProviderProfileAdapter.consumeSwitch(extracted)) {
        return;
      }

      // Close previous provider toast if exists
      if (providerToastRef.current) {
        toastManager.close(providerToastRef.current);
      }

      // Check if the new config matches any saved provider
      const matched = agentProviders.find((p) =>
        agentProviderProfileAdapter.isActiveProfile(p, extracted)
      );

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
        const adapter = getAgentProviderProfileAdapter(providerId);
        const detectionState = buildAgentProviderDetectionState({
          hasDetectedConfig: detected,
          hasAuthToken: Boolean(extracted?.authToken),
          supportsProfiles: adapter.supportsProfiles,
        });
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
                setPendingProviderAction({ action: 'preview', providerId });
              },
              variant: 'ghost',
            },
            ...(detectionState.action === 'save'
              ? [
                  {
                    label: t('Save'),
                    onClick: () => {
                      setSettingsCategory('integration');
                      setScrollToProvider(true);
                      openSettings();
                      setPendingProviderAction({ action: 'save', providerId });
                    },
                    variant: 'outline' as const,
                  },
                ]
              : []),
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
    agentProviders,
    t,
    openSettings,
    setSettingsCategory,
    setScrollToProvider,
    setPendingProviderAction,
    enableProviderWatcher,
  ]);
}
