import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

interface SessionPersistenceNoticeProps {
  isPending: boolean;
  onEnableRecovery: () => void;
  className?: string;
}

export function SessionPersistenceNotice({
  isPending,
  onEnableRecovery,
  className,
}: SessionPersistenceNoticeProps) {
  const { t } = useI18n();

  return (
    <div
      className={cn(
        'pointer-events-auto absolute right-3 top-3 z-20 w-[min(26rem,calc(100vw-1.5rem))] max-w-[26rem]',
        className
      )}
      role="status"
      aria-live="polite"
    >
      <div className="control-panel-muted rounded-2xl border border-border/70 bg-[linear-gradient(180deg,color-mix(in_oklch,var(--control-surface-muted)_78%,var(--background)_22%)_0%,color-mix(in_oklch,var(--control-surface)_48%,transparent)_100%)] px-4 py-3 shadow-[0_18px_44px_color-mix(in_oklch,var(--foreground)_16%,transparent)]">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-500">
            <AlertCircle className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground/72">
              {t('Tmux Session')}
            </div>
            <p className="text-sm font-medium text-foreground">
              {t('Local session recovery is disabled.')}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground/84">
              {t(
                'Local agent sessions started without tmux will not restore after app restart. Enable recovery before starting the next session.'
              )}
            </p>
            <div className="mt-3 flex justify-end">
              <Button size="sm" onClick={onEnableRecovery} disabled={isPending}>
                <RefreshCw className={cn('mr-2 h-3.5 w-3.5', isPending && 'animate-spin')} />
                {t('Enable Recovery')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
