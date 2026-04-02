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
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import {
  buildAppResourceActionConfirmation,
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

function getStatusBadgeVariant(status: AppResourceItem['status']) {
  switch (status) {
    case 'ready':
      return 'success';
    case 'running':
      return 'info';
    case 'error':
      return 'error';
    case 'unavailable':
      return 'warning';
    default:
      return 'secondary';
  }
}

export function AppResourceManagerDrawer({ open }: AppResourceManagerDrawerProps) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<AppResourceSnapshot | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmationState | null>(
    null
  );
  const requestSequenceRef = useRef(0);

  const loadSnapshot = useCallback(async () => {
    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;
    setLoading(true);
    setErrorMessage(null);

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
    }
  }, [t]);

  useEffect(() => {
    if (!open) {
      return;
    }

    void loadSnapshot();
  }, [loadSnapshot, open]);

  const summarySections = useMemo(
    () => (snapshot ? buildAppResourceStatusSections(snapshot.runtime, t) : []),
    [snapshot, t]
  );
  const resourceSections = useMemo(
    () => (snapshot ? buildAppResourceManagerSections(snapshot, t) : []),
    [snapshot, t]
  );

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
        className="w-[min(48rem,calc(100vw-1rem))] max-w-[48rem] bg-background"
      >
        <SheetHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <SheetTitle>{t('Resource Manager')}</SheetTitle>
              <SheetDescription>
                {t('Review runtime resources and reclaim safe targets for this window.')}
              </SheetDescription>
            </div>
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
        </SheetHeader>

        <SheetPanel scrollFade className="space-y-4">
          {loading && !snapshot ? (
            <div className="ui-type-panel-description rounded-lg border border-border/70 bg-muted/35 px-3 py-4 text-center text-muted-foreground">
              {t('Loading resources...')}
            </div>
          ) : null}

          {errorMessage ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-3">
              <div className="ui-type-block-title flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span>{t('Resource action failed')}</span>
              </div>
              <p className="ui-type-meta mt-2 break-words text-muted-foreground">{errorMessage}</p>
            </div>
          ) : null}

          {snapshot ? (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                {summarySections.map((section) => (
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

              <div className="space-y-4">
                {resourceSections.map((section) => (
                  <section key={section.key} className="space-y-3">
                    <div className="ui-type-block-title">{section.title}</div>
                    <div className="space-y-3">
                      {section.items.map((item) => (
                        <article
                          key={item.id}
                          className="rounded-xl border border-border/70 bg-muted/12 px-4 py-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="ui-type-block-title min-w-0">{item.title}</h3>
                                <Badge
                                  size="sm"
                                  variant={getStatusBadgeVariant(item.resource.status)}
                                >
                                  {item.status}
                                </Badge>
                              </div>
                              <p className="ui-type-meta break-words text-muted-foreground">
                                {item.subtitle}
                              </p>
                            </div>

                            {item.actions.length > 0 ? (
                              <div className="flex flex-wrap items-center justify-end gap-2">
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
                                          : 'outline'
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
                            <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                              {item.metrics.map((metric) => (
                                <div key={metric.key} className="rounded-lg bg-muted/30 px-3 py-2">
                                  <dt className="ui-type-meta text-muted-foreground">
                                    {metric.label}
                                  </dt>
                                  <dd className="ui-type-meta mt-1 break-words text-foreground">
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
