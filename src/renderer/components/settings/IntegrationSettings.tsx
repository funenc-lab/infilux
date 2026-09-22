import { ChevronRight } from 'lucide-react';
import * as React from 'react';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/i18n';
import { useSettingsStore } from '@/stores/settings';
import type { StatusLineFieldSettings } from '@/stores/settings/types';
import { ProviderList } from './agent-provider';
import { KeybindingInput } from './KeybindingsSettings';
import { McpSection } from './mcp';
import { PluginsSection } from './plugins';
import { PromptsSection } from './prompts';

interface IntegrationSettingsProps {
  /** Scroll to the provider section on mount */
  scrollToProvider?: boolean;
  repoPath?: string;
}

interface IntegrationSectionProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
}

const STATUS_LINE_FIELD_GROUPS: Array<{
  label: string;
  fields: Array<{
    key: keyof StatusLineFieldSettings;
    label: string;
    defaultValue: boolean;
  }>;
}> = [
  {
    label: 'Core telemetry',
    fields: [
      { key: 'model', label: 'Model', defaultValue: true },
      { key: 'context', label: 'Context', defaultValue: true },
      { key: 'cost', label: 'Cost', defaultValue: true },
    ],
  },
  {
    label: 'Diagnostics',
    fields: [
      { key: 'duration', label: 'Duration', defaultValue: false },
      { key: 'lines', label: 'Lines Changed', defaultValue: false },
      { key: 'tokens', label: 'Tokens', defaultValue: false },
      { key: 'cache', label: 'Cache', defaultValue: false },
      { key: 'apiTime', label: 'API Time', defaultValue: false },
    ],
  },
  {
    label: 'Workspace context',
    fields: [
      { key: 'currentDir', label: 'Current Dir', defaultValue: false },
      { key: 'projectDir', label: 'Project Dir', defaultValue: false },
      { key: 'version', label: 'Version', defaultValue: false },
    ],
  },
];

function IntegrationSection({ title, description, children }: IntegrationSectionProps) {
  return (
    <section className="space-y-4 border-t border-border/70 pt-5">
      <div className="space-y-1">
        <h4 className="ui-type-block-title text-sm font-medium">{title}</h4>
        {description ? (
          <p className="ui-type-section-description text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function IntegrationSettings({ scrollToProvider, repoPath }: IntegrationSettingsProps) {
  const { t } = useI18n();
  const providerRef = React.useRef<HTMLDivElement>(null);
  const { agentIntegration, setAgentIntegration } = useSettingsStore();
  const [bridgePort, setBridgePort] = React.useState<number | null>(null);
  const [showDependencyDialog, setShowDependencyDialog] = React.useState(false);
  const selectedStatusLineFieldCount = React.useMemo(
    () =>
      STATUS_LINE_FIELD_GROUPS.flatMap((group) => group.fields).filter(
        (field) => agentIntegration.statusLineFields?.[field.key] ?? field.defaultValue
      ).length,
    [agentIntegration.statusLineFields]
  );

  const debounceOptions = React.useMemo(
    () =>
      [100, 200, 300, 500, 1000].map((value) => ({
        value,
        label: `${value}ms`,
      })),
    []
  );

  // Fetch bridge status on mount and when enabled changes
  React.useEffect(() => {
    if (agentIntegration.enabled) {
      window.electronAPI.mcp.getStatus().then((status) => {
        setBridgePort(status.port);
      });
    } else {
      setBridgePort(null);
    }
  }, [agentIntegration.enabled]);

  // Scroll to provider section when requested
  React.useEffect(() => {
    if (scrollToProvider && providerRef.current) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        providerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
      return () => clearTimeout(timer);
    }

    return undefined;
  }, [scrollToProvider]);

  const handleEnabledChange = (checked: boolean) => {
    // Just update the settings - App.tsx useEffect will handle the bridge
    setAgentIntegration({ enabled: checked });
  };

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h3 className="text-lg font-medium">{t('Agent Integrations')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('Configure provider routing and CLI-specific integration features')}
        </p>
      </div>

      <div ref={providerRef}>
        <IntegrationSection
          title={t('Agent Providers')}
          description={t('Save and switch detected provider profiles for supported Agent CLIs')}
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 space-y-0.5">
                <span className="text-sm font-medium">{t('Provider Switcher')}</span>
                <p className="text-xs text-muted-foreground">
                  {t('Show provider switcher in SessionBar for quick switching')}
                </p>
              </div>
              <Switch
                checked={agentIntegration.showProviderSwitcher ?? true}
                onCheckedChange={(checked) =>
                  setAgentIntegration({ showProviderSwitcher: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 space-y-0.5">
                <span className="text-sm font-medium">{t('Provider Watcher')}</span>
                <p className="text-xs text-muted-foreground">
                  {t('Watch supported provider settings files for external changes')}
                </p>
              </div>
              <Switch
                checked={agentIntegration.enableProviderWatcher ?? true}
                onCheckedChange={(checked) =>
                  setAgentIntegration({ enableProviderWatcher: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 space-y-0.5">
                <span className="text-sm font-medium">{t('Provider Disable Feature')}</span>
                <p className="text-xs text-muted-foreground">
                  {t('Allow temporarily disabling individual providers')}
                </p>
              </div>
              <Switch
                checked={agentIntegration.enableProviderDisableFeature ?? true}
                onCheckedChange={(checked) =>
                  setAgentIntegration({ enableProviderDisableFeature: checked })
                }
              />
            </div>
          </div>

          <div className="border-t border-border/60 pt-4">
            <ProviderList repoPath={repoPath} />
          </div>
        </IntegrationSection>
      </div>

      <IntegrationSection title={t('Agent IDE Bridge')}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <p className="ui-type-section-description text-muted-foreground">
              {t('Start provider-supported editor context and lifecycle hook bridges')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={
                agentIntegration.enabled && bridgePort
                  ? 'rounded-md border border-success/35 bg-success/10 px-2 py-1 text-xs text-success-foreground'
                  : 'rounded-md border border-border/70 bg-muted/30 px-2 py-1 text-xs text-muted-foreground'
              }
            >
              {agentIntegration.enabled && bridgePort
                ? t('Running on port {{port}}', { port: bridgePort })
                : t('Stopped')}
            </span>
            <Switch checked={agentIntegration.enabled} onCheckedChange={handleEnabledChange} />
          </div>
        </div>

        {agentIntegration.enabled && (
          <div className="space-y-4 border-t border-border/60 pt-4">
            {/* Selection Changed Debounce */}
            <div className="settings-field-row">
              <span className="text-sm font-medium">{t('Debounce Time')}</span>
              <div className="space-y-1.5">
                <Select
                  value={String(agentIntegration.selectionChangedDebounce)}
                  onValueChange={(v) =>
                    setAgentIntegration({ selectionChangedDebounce: Number(v) })
                  }
                >
                  <SelectTrigger className="w-32">
                    <SelectValue>{agentIntegration.selectionChangedDebounce}ms</SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    {debounceOptions.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t('Delay before sending selection changes to supported editor bridges')}
                </p>
              </div>
            </div>

            {/* At Mentioned Keybinding */}
            <div className="settings-field-row settings-field-row-start">
              <span className="text-sm font-medium mt-2">{t('Mention Shortcut')}</span>
              <div className="space-y-1.5">
                <KeybindingInput
                  value={agentIntegration.atMentionedKeybinding}
                  onChange={(binding) => setAgentIntegration({ atMentionedKeybinding: binding })}
                />
                <p className="text-xs text-muted-foreground">
                  {t('Send selected code range to supported editor bridges')}
                </p>
              </div>
            </div>

            {/* Stop Hook (Enhanced Notification) */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-sm font-medium">{t('Enhanced Notification')}</span>
                <p className="text-xs text-muted-foreground">
                  {t('Use provider completion hooks for precise agent completion notifications')}
                </p>
              </div>
              <Switch
                checked={agentIntegration.stopHookEnabled}
                onCheckedChange={(checked) => {
                  if (!checked && agentIntegration.enhancedInputAutoPopup === 'hideWhileRunning') {
                    // Show dependency dialog when disabling and hideWhileRunning is selected
                    setShowDependencyDialog(true);
                  } else {
                    setAgentIntegration({ stopHookEnabled: checked });
                  }
                }}
              />
            </div>

            {/* Dependency Dialog */}
            <AlertDialog open={showDependencyDialog}>
              <AlertDialogPopup>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('Feature Dependency')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t(
                      '"Hide While Running" mode requires "Enhanced Notification". Display mode will be switched to "Always Show".'
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogClose
                    render={(props) => (
                      <Button
                        {...props}
                        onClick={() => {
                          setAgentIntegration({
                            stopHookEnabled: false,
                            enhancedInputAutoPopup: 'always',
                          });
                          setShowDependencyDialog(false);
                        }}
                      >
                        {t('Confirm')}
                      </Button>
                    )}
                  />
                </AlertDialogFooter>
              </AlertDialogPopup>
            </AlertDialog>

            {/* Ask User Question Notification */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-sm font-medium">{t('Ask User Question Notification')}</span>
                <p className="text-xs text-muted-foreground">
                  {t('Notify when a supported agent asks for input or permission')}
                </p>
              </div>
              <Switch
                checked={agentIntegration.permissionRequestHookEnabled}
                onCheckedChange={(checked) =>
                  setAgentIntegration({ permissionRequestHookEnabled: checked })
                }
              />
            </div>

            {/* Status Line */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-sm font-medium">{t('Status Line')}</span>
                <p className="text-xs text-muted-foreground">
                  {t('Show supported agent telemetry (model, context, cost) at bottom of terminal')}
                </p>
              </div>
              <Switch
                checked={agentIntegration.statusLineEnabled}
                onCheckedChange={(checked) => setAgentIntegration({ statusLineEnabled: checked })}
              />
            </div>

            <div className="settings-field-row">
              <span className="text-sm font-medium">{t('Automatic Session Rollover')}</span>
              <div className="space-y-1.5">
                <Select
                  value={agentIntegration.autoSessionRollover}
                  onValueChange={(value) =>
                    setAgentIntegration({
                      autoSessionRollover: value as 'manual' | 'critical',
                    })
                  }
                >
                  <SelectTrigger className="w-52">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectItem value="manual">{t('Manual only')}</SelectItem>
                    <SelectItem value="critical">{t('Auto on critical context')}</SelectItem>
                  </SelectPopup>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t(
                    'Choose whether a fresh session should start automatically when context usage becomes critical.'
                  )}
                </p>
              </div>
            </div>

            {/* Status Line Fields */}
            {agentIntegration.statusLineEnabled && (
              <Collapsible className="control-panel-muted rounded-xl p-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 space-y-0.5">
                    <span className="text-sm font-medium">{t('Display Fields')}</span>
                    <p className="text-xs text-muted-foreground">
                      {t('{{count}} fields selected', { count: selectedStatusLineFieldCount })}
                    </p>
                  </div>
                  <CollapsibleTrigger className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
                    <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 [[data-panel-open]_&]:rotate-90" />
                    {t('Advanced')}
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent className="mt-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {STATUS_LINE_FIELD_GROUPS.map((group) => (
                      <div key={group.label} className="space-y-2">
                        <h5 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {t(group.label)}
                        </h5>
                        <div className="space-y-2">
                          {group.fields.map((field) => {
                            const checked =
                              agentIntegration.statusLineFields?.[field.key] ?? field.defaultValue;
                            return (
                              <label key={field.key} className="flex items-center gap-2 text-sm">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(nextChecked) =>
                                    setAgentIntegration({
                                      statusLineFields: {
                                        ...agentIntegration.statusLineFields,
                                        [field.key]: nextChecked === true,
                                      },
                                    })
                                  }
                                />
                                {t(field.label)}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        )}
      </IntegrationSection>

      <IntegrationSection title={t('Developer Tools')}>
        <div className="divide-y divide-border/60">
          <McpSection repoPath={repoPath} />
          <PluginsSection repoPath={repoPath} />
          <PromptsSection repoPath={repoPath} />
        </div>
      </IntegrationSection>
    </div>
  );
}
