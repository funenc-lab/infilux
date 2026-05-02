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
import { AgentCapabilityCoveragePanel } from './AgentCapabilityCoveragePanel';
import { ProviderList } from './agent-provider';
import { resolveAgentIntegrationCapabilityModel } from './agentIntegrationCapabilityModel';
import { KeybindingInput } from './KeybindingsSettings';
import { McpSection } from './mcp';
import { PluginsSection } from './plugins';
import { PromptsSection } from './prompts';

interface IntegrationSettingsProps {
  /** Scroll to the provider section on mount */
  scrollToProvider?: boolean;
  repoPath?: string;
}

export function IntegrationSettings({ scrollToProvider, repoPath }: IntegrationSettingsProps) {
  const { t } = useI18n();
  const providerRef = React.useRef<HTMLDivElement>(null);
  const { agentIntegration, setAgentIntegration } = useSettingsStore();
  const [bridgePort, setBridgePort] = React.useState<number | null>(null);
  const [showDependencyDialog, setShowDependencyDialog] = React.useState(false);
  const [tmuxError, setTmuxError] = React.useState<string | null>(null);
  const isWindows = window.electronAPI?.env?.platform === 'win32';
  const capabilityModel = React.useMemo(() => resolveAgentIntegrationCapabilityModel(), []);

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
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t('Agent Integrations')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('Configure provider routing and CLI-specific integration features')}
        </p>
      </div>

      <div ref={providerRef} className="space-y-4 border-t pt-4">
        <div>
          <span className="text-sm font-medium">{t('Agent Providers')}</span>
          <p className="text-xs text-muted-foreground">
            {t('Save and switch detected provider profiles for supported Agent CLIs')}
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-sm font-medium">{t('Provider Switcher')}</span>
            <p className="text-xs text-muted-foreground">
              {t('Show provider switcher in SessionBar for quick switching')}
            </p>
          </div>
          <Switch
            checked={agentIntegration.showProviderSwitcher ?? true}
            onCheckedChange={(checked) => setAgentIntegration({ showProviderSwitcher: checked })}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-sm font-medium">{t('Provider Watcher')}</span>
            <p className="text-xs text-muted-foreground">
              {t('Watch supported provider settings files for external changes')}
            </p>
          </div>
          <Switch
            checked={agentIntegration.enableProviderWatcher ?? true}
            onCheckedChange={(checked) => setAgentIntegration({ enableProviderWatcher: checked })}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
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

        <ProviderList repoPath={repoPath} />
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <span className="text-sm font-medium">{t('Claude Code IDE Bridge')}</span>
          <p className="text-xs text-muted-foreground">
            {t('Start the WebSocket bridge for Claude Code editor context and hooks')}
            {bridgePort && ` (Port: ${bridgePort})`}
          </p>
        </div>
        <Switch checked={agentIntegration.enabled} onCheckedChange={handleEnabledChange} />
      </div>

      {agentIntegration.enabled && (
        <div className="mt-4 space-y-4 border-t pt-4">
          <AgentCapabilityCoveragePanel model={capabilityModel} />

          {/* Selection Changed Debounce */}
          <div className="settings-field-row">
            <span className="text-sm font-medium">{t('Debounce Time')}</span>
            <div className="space-y-1.5">
              <Select
                value={String(agentIntegration.selectionChangedDebounce)}
                onValueChange={(v) => setAgentIntegration({ selectionChangedDebounce: Number(v) })}
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
            <div className="ml-4 space-y-2 border-l-2 border-muted pl-4">
              <span className="text-xs font-medium text-muted-foreground">
                {t('Display Fields')}
              </span>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={agentIntegration.statusLineFields?.model ?? true}
                    onChange={(e) =>
                      setAgentIntegration({
                        statusLineFields: {
                          ...agentIntegration.statusLineFields,
                          model: e.target.checked,
                        },
                      })
                    }
                    className="h-4 w-4 rounded border-border"
                  />
                  {t('Model')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={agentIntegration.statusLineFields?.context ?? true}
                    onChange={(e) =>
                      setAgentIntegration({
                        statusLineFields: {
                          ...agentIntegration.statusLineFields,
                          context: e.target.checked,
                        },
                      })
                    }
                    className="h-4 w-4 rounded border-border"
                  />
                  {t('Context')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={agentIntegration.statusLineFields?.cost ?? true}
                    onChange={(e) =>
                      setAgentIntegration({
                        statusLineFields: {
                          ...agentIntegration.statusLineFields,
                          cost: e.target.checked,
                        },
                      })
                    }
                    className="h-4 w-4 rounded border-border"
                  />
                  {t('Cost')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={agentIntegration.statusLineFields?.duration ?? false}
                    onChange={(e) =>
                      setAgentIntegration({
                        statusLineFields: {
                          ...agentIntegration.statusLineFields,
                          duration: e.target.checked,
                        },
                      })
                    }
                    className="h-4 w-4 rounded border-border"
                  />
                  {t('Duration')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={agentIntegration.statusLineFields?.lines ?? false}
                    onChange={(e) =>
                      setAgentIntegration({
                        statusLineFields: {
                          ...agentIntegration.statusLineFields,
                          lines: e.target.checked,
                        },
                      })
                    }
                    className="h-4 w-4 rounded border-border"
                  />
                  {t('Lines Changed')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={agentIntegration.statusLineFields?.tokens ?? false}
                    onChange={(e) =>
                      setAgentIntegration({
                        statusLineFields: {
                          ...agentIntegration.statusLineFields,
                          tokens: e.target.checked,
                        },
                      })
                    }
                    className="h-4 w-4 rounded border-border"
                  />
                  {t('Tokens')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={agentIntegration.statusLineFields?.cache ?? false}
                    onChange={(e) =>
                      setAgentIntegration({
                        statusLineFields: {
                          ...agentIntegration.statusLineFields,
                          cache: e.target.checked,
                        },
                      })
                    }
                    className="h-4 w-4 rounded border-border"
                  />
                  {t('Cache')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={agentIntegration.statusLineFields?.apiTime ?? false}
                    onChange={(e) =>
                      setAgentIntegration({
                        statusLineFields: {
                          ...agentIntegration.statusLineFields,
                          apiTime: e.target.checked,
                        },
                      })
                    }
                    className="h-4 w-4 rounded border-border"
                  />
                  {t('API Time')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={agentIntegration.statusLineFields?.currentDir ?? false}
                    onChange={(e) =>
                      setAgentIntegration({
                        statusLineFields: {
                          ...agentIntegration.statusLineFields,
                          currentDir: e.target.checked,
                        },
                      })
                    }
                    className="h-4 w-4 rounded border-border"
                  />
                  {t('Current Dir')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={agentIntegration.statusLineFields?.projectDir ?? false}
                    onChange={(e) =>
                      setAgentIntegration({
                        statusLineFields: {
                          ...agentIntegration.statusLineFields,
                          projectDir: e.target.checked,
                        },
                      })
                    }
                    className="h-4 w-4 rounded border-border"
                  />
                  {t('Project Dir')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={agentIntegration.statusLineFields?.version ?? false}
                    onChange={(e) =>
                      setAgentIntegration({
                        statusLineFields: {
                          ...agentIntegration.statusLineFields,
                          version: e.target.checked,
                        },
                      })
                    }
                    className="h-4 w-4 rounded border-border"
                  />
                  {t('Version')}
                </label>
              </div>
            </div>
          )}

          {/* Tmux Session (non-Windows only) */}
          {!isWindows && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-sm font-medium">{t('Tmux Session')}</span>
                  <p className="text-xs text-muted-foreground">
                    {t('Wrap local agent sessions in tmux for session persistence and recovery')}
                  </p>
                </div>
                <Switch
                  checked={agentIntegration.tmuxEnabled}
                  onCheckedChange={async (checked) => {
                    if (checked) {
                      setTmuxError(null);
                      const result = await window.electronAPI.tmux.check(repoPath, true);
                      if (!result.installed) {
                        setTmuxError(t('tmux is not installed. Please install tmux first.'));
                        return;
                      }
                    }
                    setTmuxError(null);
                    setAgentIntegration({ tmuxEnabled: checked });
                  }}
                />
              </div>
              {tmuxError && <p className="text-xs text-destructive">{tmuxError}</p>}
            </div>
          )}
        </div>
      )}

      {/* MCP Servers */}
      <McpSection repoPath={repoPath} />

      {/* Plugins */}
      <PluginsSection repoPath={repoPath} />

      {/* Prompts */}
      <PromptsSection repoPath={repoPath} />
    </div>
  );
}
