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
  countVisibleResourcesByGroup,
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

function getStatusChipClassName(status: AppResourceItem['status']) {
  switch (status) {
    case 'running':
      return 'control-chip control-chip-live';
    case 'ready':
      return 'control-chip control-chip-done';
    case 'reconnecting':
      return 'control-chip control-chip-wait';
    case 'dead':
    case 'error':
      return 'control-chip border-destructive/32 bg-destructive/8 text-destructive';
    default:
      return 'control-chip';
  }
}

function getResourceKindLabel(resource: AppResourceItem, translate: Translate) {
  switch (resource.kind) {
    case 'electron-process':
      return translate('Electron runtime');
    case 'session':
      return translate(resource.sessionKind === 'terminal' ? 'Terminal' : 'Agent');
    case 'service':
      return translate('Support services');
  }
}

function getHeaderStats(snapshot: AppResourceSnapshot | null, translate: Translate) {
  if (!snapshot) {
    return [];
  }

  const visibleCounts = countVisibleResourcesByGroup(snapshot);

  return [
    {
      key: 'runtime',
      label: translate('Processes'),
      value: visibleCounts.runtime,
    },
    {
      key: 'sessions',
      label: translate('Sessions'),
      value: visibleCounts.sessions,
    },
    {
      key: 'services',
      label: translate('Services'),
      value: visibleCounts.services,
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
        className="w-[min(50rem,calc(100vw-1rem))] max-w-[50rem] border-s border-border/70 bg-[color:var(--theme-popover-base)] shadow-[0_24px_64px_color-mix(in_oklch,var(--foreground)_18%,transparent)]"
      >
        <SheetHeader className="border-b border-border/70 bg-[linear-gradient(180deg,color-mix(in_oklch,var(--control-surface-muted)_64%,var(--background)_36%)_0%,color-mix(in_oklch,var(--control-surface)_34%,transparent)_100%)]">
          <div className="space-y-4">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="control-chip control-chip-strong shrink-0">
                    {t('Runtime Console')}
                  </span>
                  {loading ? (
                    <span className="control-chip control-chip-live shrink-0">
                      {t('Loading resources...')}
                    </span>
                  ) : null}
                </div>
                <SheetTitle className="ui-type-title-lg mt-2">{t('Resource Manager')}</SheetTitle>
                <SheetDescription className="max-w-[42rem] text-muted-foreground/84">
                  {t('Inspect app runtime pressure and manage available resource actions.')}
                </SheetDescription>
              </div>
              <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
                {bulkActions.map((action) => {
                  const isPending =
                    pendingActionKey === `${action.request.resourceId}:${action.request.kind}`;

                  return (
                    <Button
                      key={action.key}
                      variant={action.disabled ? 'outline' : 'secondary'}
                      size="sm"
                      className="min-w-0 flex-1 justify-center sm:min-w-[11rem] sm:flex-none"
                      onClick={() => void runAction(action.request)}
                      disabled={action.disabled || isPending || loading}
                      title={action.description}
                    >
                      <span className="min-w-0 truncate">{action.label}</span>
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

            <div className="grid gap-2 sm:grid-cols-3">
              {headerStats.map((stat) => (
                <div
                  key={stat.key}
                  className="control-panel-muted rounded-xl px-3 py-2.5"
                  data-resource-manager-stat={stat.key}
                >
                  <div className="ui-type-meta text-muted-foreground/64">{stat.label}</div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-[1.35rem] font-semibold leading-none tracking-[-0.04em] text-foreground">
                      {stat.value}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {bulkActions[0] ? (
              <div className="control-panel-muted flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2.5">
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
              <div className="control-panel-muted rounded-[1.25rem] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-3">
                  <div className="ui-type-label text-muted-foreground/72">
                    {t('Runtime Console')}
                  </div>
                </div>
                <div className="grid gap-2 xl:grid-cols-3">
                  {summarySections.map((section) => (
                    <section
                      key={section.key}
                      className="rounded-xl border border-border/45 bg-[color:color-mix(in_oklch,var(--control-surface)_42%,transparent)] px-3 py-3"
                    >
                      <div className="ui-type-label text-muted-foreground/74">{section.title}</div>
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
                          className="control-panel rounded-[1.1rem] px-3.5 py-3.5 transition-colors hover:border-primary/24 hover:bg-accent/12 md:px-4"
                          data-resource-manager-card={item.resource.kind}
                        >
                          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                            <div className="min-w-0 flex-1 space-y-1.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="control-chip shrink-0">
                                  {getResourceKindLabel(item.resource, t)}
                                </span>
                                <h3 className="ui-type-title-md min-w-0 truncate">{item.title}</h3>
                                <span
                                  className={cn(
                                    getStatusChipClassName(item.resource.status),
                                    'uppercase tracking-[0.08em]'
                                  )}
                                >
                                  {item.status}
                                </span>
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
                            <dl className="mt-3 grid gap-2 border-t border-border/55 pt-3 sm:grid-cols-2 xl:grid-cols-3">
                              {item.metrics.map((metric) => (
                                <div
                                  key={metric.key}
                                  className="min-w-0 rounded-lg border border-border/38 bg-[color:color-mix(in_oklch,var(--control-surface)_38%,transparent)] px-2.5 py-2"
                                  data-resource-manager-metric={metric.key}
                                >
                                  <dt className="ui-type-meta text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground/62">
                                    {metric.label}
                                  </dt>
                                  <dd className="ui-type-body-sm mt-1 min-w-0 break-words text-foreground/92">
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
