import { Gauge } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Sheet, SheetTrigger } from '@/components/ui/sheet';
import { useWindowFocus } from '@/hooks/useWindowFocus';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { AppResourceManagerDrawer } from './AppResourceManagerDrawer';
import {
  type AppResourceAutoRefreshController,
  createAppResourceAutoRefreshController,
} from './appResourceAutoRefresh';
import {
  type AppResourceStatusTriggerViewModel,
  buildAppResourceStatusTriggerViewModel,
} from './appResourceStatusTriggerModel';

interface AppResourceStatusPopoverProps {
  className?: string;
}

const DEFAULT_TRIGGER_STATE = {
  tone: 'neutral',
  badgeLabel: null,
  badgeClassName: null,
} satisfies AppResourceStatusTriggerViewModel;

export function AppResourceStatusPopover({ className }: AppResourceStatusPopoverProps) {
  const { t } = useI18n();
  const { isWindowFocused } = useWindowFocus();
  const [open, setOpen] = useState(false);
  const [triggerState, setTriggerState] =
    useState<AppResourceStatusTriggerViewModel>(DEFAULT_TRIGGER_STATE);
  const requestSequenceRef = useRef(0);
  const inFlightLoadRef = useRef<Promise<void> | null>(null);
  const autoRefreshControllerRef = useRef<AppResourceAutoRefreshController | null>(null);

  if (autoRefreshControllerRef.current === null) {
    autoRefreshControllerRef.current = createAppResourceAutoRefreshController();
  }

  const loadTriggerState = useCallback(async () => {
    if (inFlightLoadRef.current) {
      return inFlightLoadRef.current;
    }

    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;

    const loadPromise = (async () => {
      try {
        const snapshot = await window.electronAPI.app.getResourceSnapshot();
        if (requestSequenceRef.current !== requestId) {
          return;
        }
        setTriggerState(buildAppResourceStatusTriggerViewModel(snapshot));
      } catch {
        if (requestSequenceRef.current !== requestId) {
          return;
        }
        setTriggerState(DEFAULT_TRIGGER_STATE);
      } finally {
        inFlightLoadRef.current = null;
      }
    })();

    inFlightLoadRef.current = loadPromise;
    return loadPromise;
  }, []);

  useEffect(() => {
    if (!isWindowFocused) {
      return;
    }

    void loadTriggerState();
  }, [isWindowFocused, loadTriggerState]);

  useEffect(() => {
    autoRefreshControllerRef.current?.sync({
      enabled: isWindowFocused,
      onRefresh: () => {
        void loadTriggerState();
      },
    });
  }, [isWindowFocused, loadTriggerState]);

  useEffect(() => {
    return () => {
      autoRefreshControllerRef.current?.dispose();
    };
  }, []);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <span className="control-toolbar-badge-anchor">
        <SheetTrigger
          className={cn(className)}
          aria-label={t('App runtime status')}
          title={t('App runtime status')}
          data-runtime-tone={triggerState.tone}
        >
          <Gauge
            className={cn(
              'h-3.5 w-3.5',
              triggerState.tone === 'destructive' && 'text-destructive',
              triggerState.tone === 'warning' && 'text-warning',
              triggerState.tone === 'success' && 'text-success'
            )}
          />
          <span aria-hidden="true" className="sr-only ui-type-panel-description">
            {t('App runtime status')}
          </span>
          <span aria-hidden="true" className="sr-only ui-type-meta">
            {t('App runtime status')}
          </span>
        </SheetTrigger>
        {triggerState.badgeLabel && triggerState.badgeClassName ? (
          <span
            aria-hidden="true"
            className={cn('control-badge control-toolbar-badge', triggerState.badgeClassName)}
          >
            {triggerState.badgeLabel}
          </span>
        ) : null}
      </span>
      <AppResourceManagerDrawer open={open} />
    </Sheet>
  );
}
