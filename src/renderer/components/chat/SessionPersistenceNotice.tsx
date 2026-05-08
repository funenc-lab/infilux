import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import type { SessionPersistenceNoticeKind } from './sessionPersistenceNoticePolicy';

interface SessionPersistenceNoticeProps {
  kind: SessionPersistenceNoticeKind;
  isPending?: boolean;
  onAction?: () => void;
  className?: string;
}

export function SessionPersistenceNotice({
  kind,
  isPending = false,
  onAction,
  className,
}: SessionPersistenceNoticeProps) {
  const { t } = useI18n();
  const isTmuxDisabledNotice = kind === 'tmux-disabled';
  const eyebrowLabel = isTmuxDisabledNotice ? t('Tmux Session') : t('Session Recovery');
  const title = isTmuxDisabledNotice
    ? t('Local session recovery is disabled.')
    : t('Automatic recovery is unavailable for this session.');
  const description = isTmuxDisabledNotice
    ? t(
        'Local agent sessions started without tmux will not restore after app restart. Enable recovery before starting the next session.'
      )
    : t(
        'Persistent host recovery is unavailable and this session cannot resume automatically. Start a fresh session to continue.'
      );
  const actionLabel = isTmuxDisabledNotice ? t('Enable Recovery') : t('Start fresh session');

  return (
    <div
      className={cn(
        'pointer-events-none absolute right-3 top-3 z-20 w-[min(26rem,calc(100vw-1.5rem))] max-w-[26rem]',
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
              {eyebrowLabel}
            </div>
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground/84">{description}</p>
            {onAction ? (
              <div className="mt-3 flex justify-end pointer-events-auto">
                <Button size="sm" onClick={onAction} disabled={isPending}>
                  {isTmuxDisabledNotice ? (
                    <RefreshCw className={cn('mr-2 h-3.5 w-3.5', isPending && 'animate-spin')} />
                  ) : null}
                  {actionLabel}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
