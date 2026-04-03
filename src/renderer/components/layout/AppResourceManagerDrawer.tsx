import type { AppResourceActionRequest, AppResourceItem, AppResourceSnapshot } from '@shared/types';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from '@/components/ui/sheet';
import { useWindowFocus } from '@/hooks/useWindowFocus';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import {
  type AppResourceAutoRefreshController,
  createAppResourceAutoRefreshController,
} from './appResourceAutoRefresh';
import {
  buildAppResourceActionConfirmation,
  buildAppResourceManagerBulkActions,
  buildAppResourceManagerSections,
} from './appResourceManagerModel';
import { buildAppResourceStatusSections } from './appResourceStatusModel';

interface AppResourceManagerDrawerProps {
  open: boolean;
}

interface PendingConfirmationState {
  action: AppResourceActionRequest;
  resource: AppResourceItem;
}

type Translate = (key: string, params?: Record<string, string | number>) => string;

function getStatusBadgeVariant(status: AppResourceItem['status']) {
  switch (status) {
    case 'ready':
      return 'success';
    case 'running':
      return 'info';
    case 'reconnecting':
      return 'warning';
    case 'error':
      return 'error';
    case 'unavailable':
      return 'warning';
    default:
      return 'secondary';
  }
}

function getHeaderStats(snapshot: AppResourceSnapshot | null, translate: Translate) {
  if (!snapshot) {
    return [];
  }

  return [
    {
      key: 'runtime',
      label: translate('Processes'),
      value: snapshot.resources.filter((resource) => resource.group === 'runtime').length,
    },
    {
      key: 'sessions',
      label: translate('Sessions'),
      value: snapshot.resources.filter((resource) => resource.group === 'sessions').length,
    },
    {
      key: 'services',
      label: translate('Services'),
      value: snapshot.resources.filter((resource) => resource.group === 'services').length,
    },
  ];
}

export function AppResourceManagerDrawer({ open }: AppResourceManagerDrawerProps) {
  const { t } = useI18n();
  const { isWindowFocused } = useWindowFocus();
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<AppResourceSnapshot | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmationState | null>(
    null
  );
  const requestSequenceRef = useRef(0);
  const inFlightLoadRef = useRef<Promise<void> | null>(null);
  const autoRefreshControllerRef = useRef<AppResourceAutoRefreshController | null>(null);

  if (autoRefreshControllerRef.current === null) {
    autoRefreshControllerRef.current = createAppResourceAutoRefreshController();
  }

  const loadSnapshot = useCallback(async () => {
    if (inFlightLoadRef.current) {
      return inFlightLoadRef.current;
    }

    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;
    setLoading(true);
    setErrorMessage(null);

    const loadPromise = (async () => {
      try {
        const nextSnapshot = await window.electronAPI.app.getResourceSnapshot();
        if (requestSequenceRef.current !== requestId) {
          return;
        }
        setSnapshot(nextSnapshot);
      } catch (error) {
        if (requestSequenceRef.current !== requestId) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : t('Unable to load resources.'));
      } finally {
        if (requestSequenceRef.current === requestId) {
          setLoading(false);
        }
        inFlightLoadRef.current = null;
      }
    })();

    inFlightLoadRef.current = loadPromise;
    return loadPromise;
  }, [t]);

  useEffect(() => {
    if (!open) {
      return;
    }

    void loadSnapshot();
  }, [loadSnapshot, open]);

  useEffect(() => {
    return () => {
      autoRefreshControllerRef.current?.dispose();
    };
  }, []);

  const isAutoRefreshEnabled =
    open && isWindowFocused && pendingActionKey === null && pendingConfirmation === null;

  useEffect(() => {
    autoRefreshControllerRef.current?.sync({
      enabled: isAutoRefreshEnabled,
      onRefresh: () => {
        void loadSnapshot();
      },
    });
  }, [isAutoRefreshEnabled, loadSnapshot]);

  const summarySections = useMemo(
    () => (snapshot ? buildAppResourceStatusSections(snapshot.runtime, t) : []),
    [snapshot, t]
  );
  const resourceSections = useMemo(
    () => (snapshot ? buildAppResourceManagerSections(snapshot, t) : []),
    [snapshot, t]
  );
  const bulkActions = useMemo(
    () => (snapshot ? buildAppResourceManagerBulkActions(snapshot, t) : []),
    [snapshot, t]
  );
  const headerStats = useMemo(() => getHeaderStats(snapshot, t), [snapshot, t]);

  const runAction = useCallback(
    async (action: AppResourceActionRequest) => {
      const actionKey = `${action.resourceId}:${action.kind}`;
      setPendingActionKey(actionKey);
      setErrorMessage(null);

      try {
        const result = await window.electronAPI.app.executeResourceAction(action);
        if (!result.ok) {
          setErrorMessage(result.message);
          return;
        }

        if (action.kind !== 'reload-renderer') {
          await loadSnapshot();
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : t('Unable to execute action.'));
      } finally {
        setPendingActionKey(null);
      }
    },
    [loadSnapshot, t]
  );

  const confirmationCopy = useMemo(() => {
    if (!pendingConfirmation) {
      return null;
    }

    return buildAppResourceActionConfirmation(
      pendingConfirmation.action,
      pendingConfirmation.resource,
      t
    );
  }, [pendingConfirmation, t]);

  return (
    <>
      <SheetPopup
        side="right"
        className="w-[min(48rem,calc(100vw-1rem))] max-w-[48rem] border-s border-border/70 bg-[color:var(--theme-popover-base)] shadow-[0_24px_64px_color-mix(in_oklch,var(--foreground)_18%,transparent)]"
      >
        <SheetHeader className="border-b border-border/70 bg-[linear-gradient(180deg,color-mix(in_oklch,var(--control-surface-muted)_62%,var(--background)_38%)_0%,color-mix(in_oklch,var(--control-surface)_36%,transparent)_100%)]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="ui-type-label text-muted-foreground/72">{t('Runtime Console')}</span>
              {headerStats.map((stat) => (
                <span key={stat.key} className="control-chip">
                  <span className="text-foreground/90">{stat.value}</span>
                  <span>{stat.label}</span>
                </span>
              ))}
            </div>

            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <SheetTitle className="ui-type-title-lg">{t('Resource Manager')}</SheetTitle>
                <SheetDescription className="max-w-[42rem] text-muted-foreground/84">
                  {t('Inspect app runtime pressure and manage available resource actions.')}
                </SheetDescription>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {bulkActions.map((action) => {
                  const isPending =
                    pendingActionKey === `${action.request.resourceId}:${action.request.kind}`;

                  return (
                    <Button
                      key={action.key}
                      variant={action.disabled ? 'outline' : 'secondary'}
                      size="sm"
                      className="min-w-[11rem]"
                      onClick={() => void runAction(action.request)}
                      disabled={action.disabled || isPending || loading}
                      title={action.description}
                    >
                      {action.label}
                    </Button>
                  );
                })}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0"
                  onClick={() => void loadSnapshot()}
                  aria-label={t('Refresh')}
                  title={t('Refresh')}
                  disabled={loading}
                >
                  <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                </Button>
              </div>
            </div>

            {bulkActions[0] ? (
              <div className="control-panel-muted rounded-xl px-3 py-2.5">
                <p className="ui-type-meta text-muted-foreground/82">
                  {bulkActions[0].description}
                </p>
              </div>
            ) : null}
          </div>
        </SheetHeader>

        <SheetPanel scrollFade className="space-y-5 pb-4">
          {loading && !snapshot ? (
            <div className="control-panel-muted ui-type-panel-description rounded-xl px-4 py-5 text-center text-muted-foreground">
              {t('Loading resources...')}
            </div>
          ) : null}

          {errorMessage ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3.5">
              <div className="ui-type-block-title flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span>{t('Resource action failed')}</span>
              </div>
              <p className="ui-type-meta mt-2 break-words text-muted-foreground">{errorMessage}</p>
            </div>
          ) : null}

          {snapshot ? (
            <>
              <div className="grid gap-3 xl:grid-cols-3">
                {summarySections.map((section) => (
                  <section
                    key={section.key}
                    className="control-panel-muted rounded-[1.1rem] px-4 py-3.5"
                  >
                    <div className="ui-type-label text-muted-foreground/72">{section.title}</div>
                    <dl className="mt-3 grid gap-2">
                      {section.metrics.map((metric, index) => (
                        <div
                          key={metric.key}
                          className={cn(
                            'grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 border-border/50',
                            index === 0 ? 'pt-0' : 'border-t pt-2'
                          )}
                        >
                          <dt className="ui-type-meta min-w-0 text-muted-foreground/78">
                            {metric.label}
                          </dt>
                          <dd className="ui-type-meta shrink-0 text-right font-medium text-foreground">
                            {metric.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}
              </div>

              <div className="space-y-4">
                {resourceSections.map((section) => (
                  <section key={section.key} className="space-y-3.5">
                    <div className="flex items-center gap-3">
                      <div className="ui-type-label text-muted-foreground/74">{section.title}</div>
                      <div className="h-px flex-1 bg-border/55" />
                      <span className="control-chip">{section.items.length}</span>
                    </div>
                    <div className="space-y-3">
                      {section.items.map((item) => (
                        <article
                          key={item.id}
                          className="control-panel rounded-[1.15rem] px-4 py-4 md:px-5"
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 flex-1 space-y-1.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="ui-type-title-md min-w-0">{item.title}</h3>
                                <Badge
                                  size="sm"
                                  variant={getStatusBadgeVariant(item.resource.status)}
                                  className="uppercase tracking-[0.08em]"
                                >
                                  {item.status}
                                </Badge>
                              </div>
                              <p className="ui-type-meta break-words text-muted-foreground/80">
                                {item.subtitle}
                              </p>
                            </div>

                            {item.actions.length > 0 ? (
                              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                                {item.actions.map((action) => {
                                  const isPending =
                                    pendingActionKey ===
                                    `${action.request.resourceId}:${action.request.kind}`;
                                  const handleClick = () => {
                                    if (action.dangerLevel === 'danger') {
                                      setPendingConfirmation({
                                        action: action.request,
                                        resource: item.resource,
                                      });
                                      return;
                                    }

                                    void runAction(action.request);
                                  };

                                  return (
                                    <Button
                                      key={action.key}
                                      size="xs"
                                      variant={
                                        action.dangerLevel === 'danger'
                                          ? 'destructive-outline'
                                          : 'ghost'
                                      }
                                      onClick={handleClick}
                                      disabled={isPending}
                                    >
                                      {action.label}
                                    </Button>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>

                          {item.metrics.length > 0 ? (
                            <dl className="mt-4 grid gap-x-6 gap-y-3 border-t border-border/55 pt-4 sm:grid-cols-2">
                              {item.metrics.map((metric) => (
                                <div key={metric.key} className="min-w-0">
                                  <dt className="ui-type-meta text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground/62">
                                    {metric.label}
                                  </dt>
                                  <dd className="ui-type-body-sm mt-1 break-words text-foreground/92">
                                    {metric.value}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </>
          ) : null}
        </SheetPanel>
      </SheetPopup>

      <AlertDialog
        open={pendingConfirmation !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setPendingConfirmation(null);
          }
        }}
      >
        <AlertDialogPopup className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmationCopy?.title ?? t('Confirm action')}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmationCopy?.description ?? t('Review this action before continuing.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline">{t('Cancel')}</Button>} />
            <Button
              variant="destructive"
              onClick={() => {
                if (!pendingConfirmation) {
                  return;
                }

                const action = pendingConfirmation.action;
                setPendingConfirmation(null);
                void runAction(action);
              }}
            >
              {confirmationCopy?.confirmLabel ?? t('Continue')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
