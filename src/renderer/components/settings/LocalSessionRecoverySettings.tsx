import * as React from 'react';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/i18n';
import { useSettingsStore } from '@/stores/settings';

interface LocalSessionRecoverySettingsProps {
  repoPath?: string;
}

export function LocalSessionRecoverySettings({ repoPath }: LocalSessionRecoverySettingsProps) {
  const { t } = useI18n();
  const { agentIntegration, setAgentIntegration } = useSettingsStore();
  const [tmuxError, setTmuxError] = React.useState<string | null>(null);
  const [isCheckingTmux, setIsCheckingTmux] = React.useState(false);
  const isWindows = window.electronAPI?.env?.platform === 'win32';

  const handleRecoveryChange = React.useCallback(
    async (enabled: boolean) => {
      if (!enabled) {
        setTmuxError(null);
        setAgentIntegration({ tmuxEnabled: false });
        return;
      }

      setIsCheckingTmux(true);
      setTmuxError(null);
      try {
        const result = await window.electronAPI.tmux.check(repoPath, true);
        if (!result.installed) {
          setTmuxError(t('tmux is not installed. Please install tmux first.'));
          return;
        }

        setAgentIntegration({ tmuxEnabled: true });
      } catch (error) {
        console.error('[LocalSessionRecoverySettings] Failed to verify tmux availability', error);
        setTmuxError(t('Unable to verify tmux. Please try again.'));
      } finally {
        setIsCheckingTmux(false);
      }
    },
    [repoPath, setAgentIntegration, t]
  );

  if (isWindows) {
    return null;
  }

  return (
    <section className="rounded-lg border border-border/80 bg-muted/20 p-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h4 className="text-sm font-medium">{t('Local session recovery')}</h4>
          <p className="text-xs text-muted-foreground">
            {t('Keep local agent sessions recoverable after restarting the app.')}
          </p>
          <p className="text-xs text-muted-foreground">
            {t(
              'New sessions created after enabling recovery can restore after an app restart. Restart existing sessions to make them recoverable.'
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {agentIntegration.tmuxEnabled ? t('Enabled') : t('Disabled')}
          </span>
          <Switch
            aria-label={t('Enable local session recovery')}
            checked={agentIntegration.tmuxEnabled}
            disabled={isCheckingTmux}
            onCheckedChange={handleRecoveryChange}
          />
        </div>
      </div>
      {tmuxError ? <p className="mt-2 text-xs text-destructive">{tmuxError}</p> : null}
    </section>
  );
}
