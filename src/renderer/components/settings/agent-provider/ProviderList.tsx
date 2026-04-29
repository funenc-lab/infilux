import type { AgentProviderProfile } from '@shared/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Reorder, useDragControls } from 'framer-motion';
import {
  Ban,
  Check,
  CheckCircle,
  Circle,
  Eye,
  GripVertical,
  Pencil,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog';
import { toastManager } from '@/components/ui/toast';
import { Tooltip, TooltipPopup, TooltipTrigger } from '@/components/ui/tooltip';
import { useShouldPoll } from '@/hooks/useWindowFocus';
import { useI18n } from '@/i18n';
import {
  agentProviderProfileAdapter,
  agentProviderProfileRegistry,
  getAgentProviderProfileAdapter,
} from '@/lib/agentProviderProfiles';
import { buildSettingsWorkflowToastCopy } from '@/lib/feedbackCopy';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';
import { ProviderDialog } from './ProviderDialog';
import { buildAgentProviderProfileListSummary } from './providerListModel';

interface ProviderListProps {
  className?: string;
  repoPath?: string;
}

interface ProviderItemProps {
  provider: AgentProviderProfile;
  isActive: boolean;
  isDisabled: boolean;
  enableProviderDisableFeature: boolean;
  onSwitch: (provider: AgentProviderProfile) => void;
  onToggleEnabled: (provider: AgentProviderProfile, e: React.MouseEvent) => void;
  onEdit: (provider: AgentProviderProfile) => void;
  onDelete: (provider: AgentProviderProfile) => void;
  t: (key: string) => string;
}

function ProviderItem({
  provider,
  isActive,
  isDisabled,
  enableProviderDisableFeature,
  onSwitch,
  onToggleEnabled,
  onEdit,
  onDelete,
  t,
}: ProviderItemProps) {
  const controls = useDragControls();
  const isDraggingRef = React.useRef(false);
  const profileAdapter = getAgentProviderProfileAdapter(provider.providerId);

  // Treat all providers as enabled when temporary disabling is turned off.
  const effectiveIsDisabled = enableProviderDisableFeature ? isDisabled : false;
  const canSwitch = profileAdapter.supportsProfiles;

  return (
    <Reorder.Item
      key={provider.id}
      value={provider}
      dragListener={false}
      dragControls={controls}
      className={cn(
        'group flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors',
        isActive
          ? 'border-border bg-muted/45 text-foreground'
          : effectiveIsDisabled || !canSwitch
            ? 'border-transparent opacity-60'
            : 'cursor-pointer border-transparent hover:bg-muted/40'
      )}
      onClick={() => {
        // Ignore the click that follows a drag-handle release.
        if (isDraggingRef.current) {
          isDraggingRef.current = false;
          return;
        }
        !isActive && !effectiveIsDisabled && canSwitch && onSwitch(provider);
      }}
      onKeyDown={(e) => {
        if (
          !isActive &&
          !effectiveIsDisabled &&
          canSwitch &&
          (e.key === 'Enter' || e.key === ' ')
        ) {
          e.preventDefault();
          onSwitch(provider);
        }
      }}
      drag="y"
    >
      <div className="min-w-0 flex items-center gap-2">
        <div
          role="button"
          tabIndex={0}
          aria-label={t('Drag to reorder')}
          onPointerDown={(e) => {
            isDraggingRef.current = true;
            controls.start(e);
          }}
          className="cursor-grab text-muted-foreground active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </div>

        {isActive ? (
          <CheckCircle className="h-4 w-4" />
        ) : (
          <Circle className="h-4 w-4 text-muted-foreground" />
        )}

        <div className="min-w-0">
          <span
            className={cn(
              'ui-type-block-title block truncate text-sm font-medium',
              effectiveIsDisabled && 'text-muted-foreground line-through'
            )}
          >
            {provider.name}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {profileAdapter.label}
            {!profileAdapter.supportsProfiles ? ` · ${t('Waiting for provider adapter')}` : ''}
          </span>
        </div>
      </div>

      <div className="ml-3 flex shrink-0 items-center gap-1">
        {enableProviderDisableFeature && (
          <Tooltip>
            <TooltipTrigger render={<span />}>
              <Button variant="ghost" size="icon-xs" onClick={(e) => onToggleEnabled(provider, e)}>
                {isDisabled ? (
                  <Check className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <Ban className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipPopup>
              {isDisabled
                ? t('Click to enable this Provider')
                : t('Click to disable this Provider')}
            </TooltipPopup>
          </Tooltip>
        )}

        <Button
          variant="ghost"
          size="icon-xs"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(provider);
          }}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon-xs"
          className="text-destructive hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(provider);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </Reorder.Item>
  );
}

export function ProviderList({ className, repoPath }: ProviderListProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const providers = useSettingsStore((s) => s.agentIntegration.providers);
  const removeAgentProvider = useSettingsStore((s) => s.removeAgentProvider);
  const shouldPoll = useShouldPoll();
  const enableProviderDisableFeature = useSettingsStore(
    (s) => s.agentIntegration.enableProviderDisableFeature
  );
  const providerCapabilitySummary = React.useMemo(
    () =>
      buildAgentProviderProfileListSummary(
        providers,
        agentProviderProfileRegistry.map((adapter) => ({
          providerId: adapter.providerId,
          supportsProfiles: adapter.supportsProfiles,
        }))
      ),
    [providers]
  );

  const setAgentProviderEnabled = useSettingsStore((s) => s.setAgentProviderEnabled);
  const setAgentProviderOrder = useSettingsStore((s) => s.setAgentProviderOrder);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingProvider, setEditingProvider] = React.useState<AgentProviderProfile | null>(null);
  const [saveFromCurrent, setSaveFromCurrent] = React.useState(false);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [pendingDetectedAction, setPendingDetectedAction] = React.useState<
    'preview' | 'save' | null
  >(null);
  const providerSettingsQueryKey = React.useMemo(
    () => agentProviderProfileAdapter.queryKey(repoPath),
    [repoPath]
  );

  // Read the current provider settings and stop polling while the window is idle.
  const { data: providerData } = useQuery({
    queryKey: providerSettingsQueryKey,
    queryFn: () => agentProviderProfileAdapter.readCurrent(repoPath),
    refetchInterval: shouldPoll ? 30000 : false,
  });

  // Listen for settings.json changes emitted by the main-process watcher.
  // Refresh immediately when external tools such as cc-switch modify the config.
  // Stop listening while the window is idle to reduce background work.
  React.useEffect(() => {
    if (!shouldPoll) return;

    const cleanup = agentProviderProfileAdapter.subscribeToExternalChanges(repoPath, () => {
      queryClient.invalidateQueries({ queryKey: providerSettingsQueryKey });
    });
    return cleanup;
  }, [providerSettingsQueryKey, queryClient, repoPath, shouldPoll]);

  // Compute the currently active provider.
  const activeProvider = React.useMemo(() => {
    const currentConfig = providerData?.extracted;
    if (!currentConfig) return null;
    return (
      providers.find((p) => agentProviderProfileAdapter.isActiveProfile(p, currentConfig)) ?? null
    );
  }, [providers, providerData?.extracted]);

  const detectedProviderId = providerData?.providerId ?? providerData?.extracted?.providerId;
  const detectedProviderLabel = detectedProviderId
    ? getAgentProviderProfileAdapter(detectedProviderId).label
    : null;
  const hasDetectedConfig = Boolean(providerData?.extracted?.baseUrl);
  const hasCompleteDetectedConfig = Boolean(
    providerData?.extracted?.baseUrl && providerData.extracted.authToken
  );

  // Check whether the current config has not been saved as a provider profile.
  const hasUnsavedConfig = React.useMemo(() => {
    if (!hasCompleteDetectedConfig) return false;
    return !activeProvider;
  }, [hasCompleteDetectedConfig, activeProvider]);

  const detectedConfigStatus = React.useMemo(() => {
    if (activeProvider) {
      return t('Provider profile already saved as {{name}}', { name: activeProvider.name });
    }
    if (!hasCompleteDetectedConfig) {
      return t('Detected CLI config is missing required provider credentials.');
    }
    return t('Current config not saved');
  }, [activeProvider, hasCompleteDetectedConfig, t]);

  // Switch provider.
  const handleSwitch = async (provider: AgentProviderProfile) => {
    agentProviderProfileAdapter.markSwitch(provider);
    const success = await agentProviderProfileAdapter.apply(repoPath, provider);
    if (success) {
      queryClient.invalidateQueries({ queryKey: providerSettingsQueryKey });
      const copy = buildSettingsWorkflowToastCopy(
        {
          action: 'provider-switch',
          phase: 'success',
          name: provider.name,
        },
        t
      );
      toastManager.add({
        type: 'success',
        title: copy.title,
        description: copy.description,
      });
    } else {
      agentProviderProfileAdapter.clearSwitch(provider.providerId);
      const copy = buildSettingsWorkflowToastCopy(
        {
          action: 'provider-switch',
          phase: 'error',
        },
        t
      );
      toastManager.add({
        type: 'error',
        title: copy.title,
        description: t('Provider profile switching is not available for this AI tool yet.'),
      });
    }
  };

  // Edit provider.
  const handleEdit = (provider: AgentProviderProfile) => {
    setEditingProvider(provider);
    setSaveFromCurrent(false);
    setDialogOpen(true);
  };

  // Delete provider.
  const handleDelete = (provider: AgentProviderProfile) => {
    removeAgentProvider(provider.id);
  };

  // Handle drag reordering.
  const handleReorder = (newProviders: AgentProviderProfile[]) => {
    setAgentProviderOrder(newProviders);
  };

  const handleToggleEnabled = (provider: AgentProviderProfile, e: React.MouseEvent) => {
    e.stopPropagation();
    setAgentProviderEnabled(provider.id, provider.enabled === false);
  };

  // Add provider.
  const handleAdd = () => {
    setEditingProvider(null);
    setSaveFromCurrent(false);
    setDialogOpen(true);
  };

  // Save from the current config.
  const handleSaveFromCurrent = React.useCallback(() => {
    if (!hasCompleteDetectedConfig) {
      return false;
    }

    setEditingProvider(null);
    setSaveFromCurrent(true);
    setDialogOpen(true);
    return true;
  }, [hasCompleteDetectedConfig]);

  const handlePreviewCurrent = React.useCallback(() => {
    if (!hasDetectedConfig) {
      return false;
    }

    setPreviewOpen(true);
    return true;
  }, [hasDetectedConfig]);

  React.useEffect(() => {
    if (!pendingDetectedAction) {
      return;
    }

    if (pendingDetectedAction === 'preview') {
      if (handlePreviewCurrent()) {
        setPendingDetectedAction(null);
      }
      return;
    }

    if (handleSaveFromCurrent()) {
      setPendingDetectedAction(null);
      return;
    }

    if (hasDetectedConfig) {
      setPreviewOpen(true);
      setPendingDetectedAction(null);
    }
  }, [handlePreviewCurrent, handleSaveFromCurrent, hasDetectedConfig, pendingDetectedAction]);

  React.useEffect(() => {
    const handlePreviewOpen = () => {
      if (!handlePreviewCurrent()) {
        setPendingDetectedAction('preview');
      }
    };
    const handleSaveOpen = () => {
      if (!handleSaveFromCurrent()) {
        setPendingDetectedAction('save');
      }
    };

    window.addEventListener('open-settings-provider-preview', handlePreviewOpen);
    window.addEventListener('open-settings-provider-save', handleSaveOpen);

    return () => {
      window.removeEventListener('open-settings-provider-preview', handlePreviewOpen);
      window.removeEventListener('open-settings-provider-save', handleSaveOpen);
    };
  }, [handlePreviewCurrent, handleSaveFromCurrent]);

  return (
    <div className={cn('space-y-3', className)}>
      <div className="rounded-lg border border-border/80 bg-muted/30 px-3 py-2.5">
        {hasDetectedConfig ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 space-y-0.5">
              <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
                <span className="truncate">{t('Current CLI Config Detected')}</span>
                {detectedProviderLabel && (
                  <span className="shrink-0 rounded-md border border-border/70 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {detectedProviderLabel}
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-muted-foreground">{detectedConfigStatus}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="ghost" size="xs" className="h-6" onClick={handlePreviewCurrent}>
                <Eye className="mr-1 h-3.5 w-3.5" />
                {t('Preview')}
              </Button>
              {hasUnsavedConfig && (
                <Button variant="default" size="xs" className="h-6" onClick={handleSaveFromCurrent}>
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  {t('Save Current CLI Config')}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="min-w-0 space-y-0.5">
              <div className="text-sm font-medium">
                {t('No supported CLI provider config detected yet.')}
              </div>
              <p className="text-xs text-muted-foreground">
                {t('Open a supported Agent CLI once, then save the detected configuration here.')}
              </p>
            </div>
          </div>
        )}
      </div>

      {providers.length > 0 && (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span className="rounded-md border border-border/60 px-2 py-1">
            {t('{{count}} saved provider profiles', {
              count: providerCapabilitySummary.savedCount,
            })}
          </span>
          <span className="rounded-md border border-border/60 px-2 py-1">
            {t('{{count}} switchable', {
              count: providerCapabilitySummary.switchableCount,
            })}
          </span>
          {providerCapabilitySummary.waitingForAdapterCount > 0 && (
            <span className="rounded-md border border-warning/30 bg-warning/8 px-2 py-1 text-warning">
              {t('{{count}} waiting for provider adapter', {
                count: providerCapabilitySummary.waitingForAdapterCount,
              })}
            </span>
          )}
        </div>
      )}

      {providers.length > 0 ? (
        <Reorder.Group
          axis="y"
          values={providers}
          onReorder={handleReorder}
          className="space-y-1.5"
        >
          {providers.map((provider) => {
            const isActive = activeProvider?.id === provider.id;
            const isDisabled = provider.enabled === false;

            return (
              <ProviderItem
                key={provider.id}
                provider={provider}
                isActive={isActive}
                isDisabled={isDisabled}
                enableProviderDisableFeature={enableProviderDisableFeature}
                onSwitch={handleSwitch}
                onToggleEnabled={handleToggleEnabled}
                onEdit={handleEdit}
                onDelete={handleDelete}
                t={t}
              />
            );
          })}
        </Reorder.Group>
      ) : (
        <div className="py-4 text-center text-sm text-muted-foreground">
          {t('No saved provider profiles')}
        </div>
      )}

      <Button variant="outline" size="sm" className="w-full" onClick={handleAdd}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        {t('Manual Add Provider')}
      </Button>

      <ProviderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        provider={editingProvider}
        initialValues={saveFromCurrent ? providerData?.extracted : undefined}
        source={saveFromCurrent ? 'current' : 'manual'}
      />

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogPopup className="max-w-xl" showCloseButton>
          <DialogHeader>
            <DialogTitle>{t('Preview')}</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <pre className="max-h-[420px] whitespace-pre-wrap rounded-lg border border-border/70 bg-muted/35 p-3 text-xs text-muted-foreground">
              {JSON.stringify(
                agentProviderProfileAdapter.buildPreview(
                  providerData?.settings,
                  detectedProviderId
                ),
                null,
                2
              )}
            </pre>
          </DialogPanel>
          <DialogFooter variant="default">
            <div className="flex items-center gap-2">
              {hasUnsavedConfig && (
                <Button size="sm" variant="outline" className="h-8" onClick={handleSaveFromCurrent}>
                  {t('Save')}
                </Button>
              )}
              <Button size="sm" className="h-8" onClick={() => setPreviewOpen(false)}>
                {t('Close')}
              </Button>
            </div>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
