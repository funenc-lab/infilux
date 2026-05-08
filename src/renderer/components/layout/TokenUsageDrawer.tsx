import type { AppResourceSnapshot, ProjectTokenUsageSnapshot } from '@shared/types';
import { createProjectTokenUsageRequestKey } from '@shared/utils/tokenUsage';
import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { ProjectTokenUsageSummary } from './ProjectTokenUsageSummary';
import { buildProjectTokenUsageRequest } from './projectTokenUsageRequestModel';

interface TokenUsageDrawerProps {
  open: boolean;
}

interface LoadTokenUsageOptions {
  forceRefresh?: boolean;
}

function TokenUsageLoadingState() {
  const { t } = useI18n();
  const loadingLabel = t('Scanning token usage...');

  return (
    <div className="space-y-4 px-1 py-1" role="status" aria-live="polite" aria-label={loadingLabel}>
      <span className="sr-only">{loadingLabel}</span>
      <div className="space-y-3">
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-7 w-44 rounded-md" />
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-12 rounded-md" />
          <Skeleton className="h-12 rounded-md" />
          <Skeleton className="h-12 rounded-md" />
          <Skeleton className="h-12 rounded-md" />
        </div>
      </div>
      <div className="space-y-3 pt-1">
        <Skeleton className="h-px w-full rounded-none" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-2/5 rounded-md" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-2 w-full rounded-full" />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-9 rounded-md" />
            <Skeleton className="h-9 rounded-md" />
            <Skeleton className="h-9 rounded-md" />
            <Skeleton className="h-9 rounded-md" />
          </div>
        </div>
        <Skeleton className="h-px w-full rounded-none" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-1/3 rounded-md" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-2 w-5/6 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function TokenUsageDrawer({ open }: TokenUsageDrawerProps) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<ProjectTokenUsageSnapshot | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestSequenceRef = useRef(0);
  const inFlightLoadRef = useRef<Promise<void> | null>(null);
  const currentRequestKeyRef = useRef<string | null>(null);

  const loadTokenUsage = useCallback(
    async (options: LoadTokenUsageOptions = {}) => {
      if (inFlightLoadRef.current) {
        return inFlightLoadRef.current;
      }

      const requestId = requestSequenceRef.current + 1;
      requestSequenceRef.current = requestId;
      setLoading(true);
      setErrorMessage(null);

      const loadPromise = (async () => {
        let resourceSnapshot: AppResourceSnapshot | null = null;

        try {
          resourceSnapshot = await window.electronAPI.app.getResourceSnapshot();
        } catch {
          resourceSnapshot = null;
        }

        try {
          const usageRequest = buildProjectTokenUsageRequest(resourceSnapshot);
          currentRequestKeyRef.current = createProjectTokenUsageRequestKey(usageRequest);
          const nextSnapshot = await window.electronAPI.tokenUsage.getProjectUsage({
            ...usageRequest,
            ...(options.forceRefresh ? { forceRefresh: true } : {}),
          });
          if (requestSequenceRef.current !== requestId) {
            return;
          }
          setSnapshot(nextSnapshot);
        } catch (error) {
          if (requestSequenceRef.current !== requestId) {
            return;
          }
          setErrorMessage(
            error instanceof Error ? error.message : t('Unable to load token usage.')
          );
        } finally {
          if (requestSequenceRef.current === requestId) {
            setLoading(false);
          }
          inFlightLoadRef.current = null;
        }
      })();

      inFlightLoadRef.current = loadPromise;
      return loadPromise;
    },
    [t]
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    void loadTokenUsage();
  }, [loadTokenUsage, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    return window.electronAPI.tokenUsage.onProjectUsageUpdated((event) => {
      if (createProjectTokenUsageRequestKey(event.request) !== currentRequestKeyRef.current) {
        return;
      }

      setSnapshot(event.snapshot);
      setErrorMessage(null);
      setLoading(false);
    });
  }, [open]);

  const initialLoading = loading && !snapshot;
  const refreshLabel = loading ? t('Refreshing') : t('Refresh');
  const refreshDescription = loading ? t('Refreshing token usage') : t('Refresh token usage');

  return (
    <SheetPopup
      side="right"
      className="w-[min(42rem,calc(100vw-1rem))] max-w-[42rem] border-s border-border/70 bg-[color:var(--theme-popover-base)] shadow-[0_24px_64px_color-mix(in_oklch,var(--foreground)_18%,transparent)]"
    >
      <SheetHeader className="border-b border-border/70 bg-[linear-gradient(180deg,color-mix(in_oklch,var(--control-surface-muted)_62%,var(--background)_38%)_0%,color-mix(in_oklch,var(--control-surface)_36%,transparent)_100%)]">
        <div className="flex min-w-0 items-start justify-between gap-3 pe-10">
          <div className="min-w-0 space-y-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <SheetTitle className="ui-type-title-lg min-w-0">{t('Token Analytics')}</SheetTitle>
              <span className="control-chip shrink-0">{t('Project Scope')}</span>
            </div>
            <SheetDescription className="max-w-[36rem] text-muted-foreground/84">
              {t('Break down input, output, cache, and reasoning tokens by project and provider.')}
            </SheetDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 gap-2 rounded-md px-2.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => void loadTokenUsage({ forceRefresh: true })}
            aria-label={refreshDescription}
            title={refreshDescription}
            disabled={loading}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            <span>{refreshLabel}</span>
          </Button>
        </div>
      </SheetHeader>

      <SheetPanel scrollFade className="space-y-5 pb-4">
        {initialLoading ? (
          <TokenUsageLoadingState />
        ) : (
          <ProjectTokenUsageSummary
            snapshot={snapshot}
            loading={loading}
            errorMessage={errorMessage}
          />
        )}
      </SheetPanel>
    </SheetPopup>
  );
}
