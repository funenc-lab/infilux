import { AlertCircle, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import type { SessionPersistenceNoticeKind } from './sessionPersistenceNoticePolicy';

interface SessionPersistenceNoticeProps {
  kind: SessionPersistenceNoticeKind;
  isPending?: boolean;
  onAction?: () => void;
  onDismiss?: () => void;
  className?: string;
}

export function SessionPersistenceNotice({
  kind,
  isPending = false,
  onAction,
  onDismiss,
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
      <div className="control-panel-muted rounded-lg px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-warning/28 bg-warning/10 text-warning">
            <AlertCircle className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-xs font-semibold tracking-[0.06em] text-muted-foreground">
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
          {onDismiss ? (
            <button
              type="button"
              className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground pointer-events-auto"
              aria-label={t('Close')}
              title={t('Close')}
              onClick={onDismiss}
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
