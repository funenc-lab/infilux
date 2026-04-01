import type { RuntimeMemorySnapshot } from '@shared/types';
import { AlertCircle, Gauge, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverDescription,
  PopoverPopup,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { buildAppResourceStatusSections } from './appResourceStatusModel';

interface AppResourceStatusPopoverProps {
  className?: string;
}

export function AppResourceStatusPopover({ className }: AppResourceStatusPopoverProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<RuntimeMemorySnapshot | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestSequenceRef = useRef(0);

  const loadSnapshot = useCallback(async () => {
    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;
    setLoading(true);
    setErrorMessage(null);

    try {
      const nextSnapshot = await window.electronAPI.app.getRuntimeMetrics();
      if (requestSequenceRef.current !== requestId) {
        return;
      }
      setSnapshot(nextSnapshot);
    } catch (error) {
      if (requestSequenceRef.current !== requestId) {
        return;
      }
      const message = error instanceof Error ? error.message : null;
      setErrorMessage(message);
    } finally {
      if (requestSequenceRef.current === requestId) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    void loadSnapshot();
  }, [loadSnapshot, open]);

  const sections = snapshot ? buildAppResourceStatusSections(snapshot, t) : [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(className)}
        aria-label={t('App runtime status')}
        title={t('App runtime status')}
      >
        <Gauge className="h-3.5 w-3.5" />
      </PopoverTrigger>
      <PopoverPopup align="end" sideOffset={8} className="w-[22rem] max-w-[calc(100vw-1rem)]">
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <PopoverTitle>{t('App runtime')}</PopoverTitle>
              <PopoverDescription>
                {t('Review the current runtime footprint for this window.')}
              </PopoverDescription>
            </div>
            <Button
              variant="ghost"
              size="icon-xs"
              className="shrink-0"
              onClick={() => void loadSnapshot()}
              aria-label={t('Refresh runtime metrics')}
              title={t('Refresh runtime metrics')}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </Button>
          </div>

          {loading && !snapshot ? (
            <div className="ui-type-panel-description rounded-lg border border-border/70 bg-muted/35 px-3 py-4 text-center text-muted-foreground">
              {t('Loading runtime metrics...')}
            </div>
          ) : null}

          {errorMessage ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-3">
              <div className="ui-type-block-title flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span>{t('Failed to load runtime metrics')}</span>
              </div>
              <p className="ui-type-meta mt-2 break-words text-muted-foreground">{errorMessage}</p>
            </div>
          ) : null}

          {snapshot ? (
            <div className="space-y-3">
              {sections.map((section) => (
                <section
                  key={section.key}
                  className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3"
                >
                  <div className="ui-type-block-title mb-2">{section.title}</div>
                  <dl className="space-y-2">
                    {section.metrics.map((metric) => (
                      <div key={metric.key} className="flex items-start justify-between gap-3">
                        <dt className="ui-type-meta min-w-0 text-muted-foreground">
                          {metric.label}
                        </dt>
                        <dd className="ui-type-meta shrink-0 text-right text-foreground">
                          {metric.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          ) : null}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
