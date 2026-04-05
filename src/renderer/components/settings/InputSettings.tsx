import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/i18n';
import { useSettingsStore } from '@/stores/settings';

export function InputSettings() {
  const { t } = useI18n();
  const { claudeCodeIntegration, setClaudeCodeIntegration } = useSettingsStore();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t('Advanced Features')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('Configure fallback composer controls for providers without native terminal input')}
        </p>
      </div>

      <div className="rounded-xl border border-border/70 bg-muted/25 px-4 py-3">
        <div className="text-sm font-medium">
          {t('Claude and Codex now use native terminal input')}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {t(
            'Paste, drop, and tray insertion write directly into the terminal input buffer. Press Enter in the terminal when you are ready to send.'
          )}
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <span className="text-sm font-medium">{t('Fallback Composer')}</span>
          <p className="text-xs text-muted-foreground">
            {t('Enable the fallback composer for providers without native terminal input')}
          </p>
        </div>
        <Switch
          checked={claudeCodeIntegration.enhancedInputEnabled ?? true}
          onCheckedChange={(checked) => setClaudeCodeIntegration({ enhancedInputEnabled: checked })}
        />
      </div>

      {claudeCodeIntegration.enhancedInputEnabled && (
        <div className="ml-4 space-y-2 border-l-2 border-muted pl-4">
          <span className="text-xs font-medium text-muted-foreground">{t('Display Mode')}</span>
          <div className="space-y-1">
            <label className="flex items-start gap-2 rounded-md p-2 hover:bg-muted/50 cursor-pointer">
              <input
                type="radio"
                name="enhancedInputAutoPopup"
                checked={claudeCodeIntegration.enhancedInputAutoPopup === 'manual'}
                onChange={() => setClaudeCodeIntegration({ enhancedInputAutoPopup: 'manual' })}
                className="h-4 w-4 mt-0.5 shrink-0"
              />
              <div className="space-y-0.5">
                <span className="text-sm font-medium">{t('Manual')}</span>
                <p className="text-xs text-muted-foreground">
                  {t('Only open the fallback composer via Ctrl+G, Esc to close')}
                </p>
              </div>
            </label>
            <label className="flex items-start gap-2 rounded-md p-2 hover:bg-muted/50 cursor-pointer">
              <input
                type="radio"
                name="enhancedInputAutoPopup"
                checked={claudeCodeIntegration.enhancedInputAutoPopup === 'always'}
                onChange={() => setClaudeCodeIntegration({ enhancedInputAutoPopup: 'always' })}
                className="h-4 w-4 mt-0.5 shrink-0"
              />
              <div className="space-y-0.5">
                <span className="text-sm font-medium">{t('Always Show')}</span>
                <p className="text-xs text-muted-foreground">
                  {t('Composer stays visible and remains open after sending')}
                </p>
              </div>
            </label>
            <label
              className={`flex items-start gap-2 rounded-md p-2 ${!claudeCodeIntegration.stopHookEnabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/50 cursor-pointer'}`}
            >
              <input
                type="radio"
                name="enhancedInputAutoPopup"
                checked={
                  (claudeCodeIntegration.enhancedInputAutoPopup ?? 'hideWhileRunning') ===
                  'hideWhileRunning'
                }
                onChange={() =>
                  setClaudeCodeIntegration({ enhancedInputAutoPopup: 'hideWhileRunning' })
                }
                disabled={!claudeCodeIntegration.stopHookEnabled}
                className="h-4 w-4 mt-0.5 shrink-0"
              />
              <div className="space-y-0.5">
                <span className="text-sm font-medium">{t('Hide While Running')}</span>
                <p className="text-xs text-muted-foreground">
                  {t(
                    'Auto-hide the fallback composer when the agent is running, show it again when idle (requires Stop Hook)'
                  )}
                </p>
              </div>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
