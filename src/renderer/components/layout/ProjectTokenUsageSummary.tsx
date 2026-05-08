import type { ProjectTokenUsageSnapshot } from '@shared/types';
import { AlertTriangle, CircleAlert, FolderGit2, Radar } from 'lucide-react';
import { useMemo } from 'react';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { buildProjectTokenUsageSummaryModel } from './projectTokenUsageSummaryModel';

interface ProjectTokenUsageSummaryProps {
  snapshot: ProjectTokenUsageSnapshot | null;
  loading: boolean;
  errorMessage: string | null;
}

export function ProjectTokenUsageSummary({
  errorMessage,
  loading,
  snapshot,
}: ProjectTokenUsageSummaryProps) {
  const { locale, t } = useI18n();
  const model = useMemo(() => buildProjectTokenUsageSummaryModel(snapshot), [snapshot]);
  const freshnessTime = model.freshness
    ? new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(new Date(model.freshness.generatedAt))
    : null;

  if (loading && !snapshot) {
    return null;
  }

  return (
    <section
      className="space-y-4"
      aria-busy={loading ? true : undefined}
      aria-label={t('Token usage summary')}
    >
      <div className="control-panel rounded-lg px-4 py-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(14rem,0.38fr)]">
          <div className="min-w-0 space-y-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Radar className="h-4 w-4 shrink-0 text-primary/82" aria-hidden="true" />
              <div className="ui-type-label text-muted-foreground/72">{t('Project Totals')}</div>
              {model.freshness && freshnessTime ? (
                <span
                  className={cn(
                    'control-chip shrink-0',
                    model.freshness.tone === 'fresh' &&
                      'border-primary/32 bg-primary/8 text-foreground',
                    model.freshness.tone === 'cached' &&
                      'border-border/56 bg-[color:color-mix(in_oklch,var(--control-surface)_54%,transparent)] text-muted-foreground',
                    model.freshness.tone === 'refreshing' && 'control-chip-wait'
                  )}
                >
                  {t(model.freshness.statusLabel)}
                </span>
              ) : null}
            </div>

            <div className="flex min-w-0 flex-wrap items-end gap-x-4 gap-y-1">
              <div className="min-w-0">
                <div className="text-[2rem] font-semibold leading-none tracking-[-0.04em] text-foreground">
                  {model.totalTokensLabel}
                </div>
                <div className="ui-type-meta mt-1 text-muted-foreground/68">
                  {t('Total tokens')}
                </div>
              </div>
              {freshnessTime ? (
                <div className="ui-type-meta pb-1 text-muted-foreground/72">
                  {t('Updated {{time}}', { time: freshnessTime })}
                </div>
              ) : null}
            </div>

            {model.hasUsage ? (
              <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {model.overviewMetrics.map((metric) => (
                  <div
                    key={metric.key}
                    className="min-w-0 rounded-md border border-border/42 bg-[color:color-mix(in_oklch,var(--control-surface-muted)_54%,transparent)] px-3 py-2"
                  >
                    <dt className="ui-type-meta truncate text-muted-foreground/62">
                      {t(metric.label)}
                    </dt>
                    <dd className="ui-type-block-title mt-1 truncate text-foreground">
                      {metric.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-md border border-border/42 bg-[color:color-mix(in_oklch,var(--control-surface-muted)_42%,transparent)] px-3 py-2">
              <div className="ui-type-block-title text-foreground">{model.projectCountLabel}</div>
              <div className="ui-type-meta text-muted-foreground/62">{t('Tracked Projects')}</div>
            </div>
            <div className="rounded-md border border-border/42 bg-[color:color-mix(in_oklch,var(--control-surface-muted)_42%,transparent)] px-3 py-2">
              <div className="ui-type-block-title text-foreground">{model.sessionCountLabel}</div>
              <div className="ui-type-meta text-muted-foreground/62">{t('Sessions')}</div>
            </div>
            <div
              className={cn(
                'rounded-md border border-border/42 bg-[color:color-mix(in_oklch,var(--control-surface-muted)_42%,transparent)] px-3 py-2',
                model.providerStatuses.length > 0 && 'border-warning/32 bg-warning/8'
              )}
            >
              <div className="ui-type-block-title text-foreground">
                {model.providerIssueCountLabel}
              </div>
              <div className="ui-type-meta text-muted-foreground/62">{t('Provider Coverage')}</div>
            </div>
          </div>
        </div>
      </div>

      {model.hasUsage ? (
        <div className="control-panel-muted rounded-lg px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="ui-type-label text-muted-foreground/72">{t('Token Mix')}</div>
            <div className="h-px flex-1 bg-border/50" />
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <dl className="grid gap-3 sm:grid-cols-2">
              {model.primaryMetrics.map((metric) => (
                <div key={metric.key} className="min-w-0">
                  <dt className="ui-type-meta text-muted-foreground/64">{t(metric.label)}</dt>
                  <dd className="ui-type-block-title mt-1 truncate text-foreground">
                    {metric.value}
                  </dd>
                </div>
              ))}
            </dl>
            <dl className="grid gap-2 sm:grid-cols-3 lg:border-s lg:border-border/45 lg:ps-3">
              {model.secondaryMetrics.map((metric) => (
                <div key={metric.key} className="min-w-0">
                  <dt className="ui-type-meta text-muted-foreground/60">{t(metric.label)}</dt>
                  <dd className="ui-type-meta mt-1 truncate text-foreground">{metric.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/8 px-3 py-2 text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="ui-type-meta min-w-0 break-words">{errorMessage}</p>
        </div>
      ) : null}

      {!loading && !errorMessage && model.emptyState ? (
        <div className="control-panel-muted rounded-lg px-4 py-4">
          <div className="ui-type-block-title text-foreground">{t(model.emptyState.title)}</div>
          <p className="ui-type-meta mt-1 text-muted-foreground/78">
            {t(model.emptyState.description)}
          </p>
          <p className="ui-type-meta mt-1 text-muted-foreground/68">{t(model.emptyState.detail)}</p>
        </div>
      ) : null}

      {model.hasUsage && model.projects.length > 0 ? (
        <div className="control-panel-muted rounded-lg px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="ui-type-label text-muted-foreground/72">{t('Tracked Projects')}</div>
            <div className="h-px flex-1 bg-border/50" />
            <span className="control-chip">{model.projectCountLabel}</span>
          </div>

          <div className="mt-2 divide-y divide-border/55">
            {model.projects.map((project) => (
              <article key={project.key} className="py-3.5 first:pt-0 last:pb-0">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <FolderGit2 className="h-4 w-4 shrink-0 text-muted-foreground/72" />
                      <h3 className="ui-type-block-title min-w-0 truncate text-foreground">
                        {project.title}
                      </h3>
                      <span className="control-chip">{project.providerLabel}</span>
                      <span className="control-chip">{project.sessionLabel}</span>
                    </div>
                    <p className="ui-type-meta mt-1 truncate text-muted-foreground/72">
                      {project.pathLabel}
                    </p>
                  </div>

                  <div className="min-w-[8rem] text-left md:text-right">
                    <div className="ui-type-title-md text-foreground">
                      {project.totalTokensLabel}
                    </div>
                    <div className="ui-type-meta text-muted-foreground/74">
                      {project.sharePercentLabel}
                    </div>
                  </div>
                </div>

                <div
                  className="mt-3 h-1.5 overflow-hidden rounded-full bg-[color:color-mix(in_oklch,var(--border)_46%,transparent)]"
                  role="meter"
                  aria-label={t('Project usage share')}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={project.sharePercent}
                >
                  <div
                    className="h-full rounded-full bg-[color:color-mix(in_oklch,var(--primary)_64%,var(--support)_36%)]"
                    style={{ width: project.shareWidth }}
                  />
                </div>

                <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                  <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                    {project.primaryTokenMetrics.map((metric) => (
                      <div key={metric.key} className="min-w-0">
                        <dt className="ui-type-meta text-muted-foreground/60">{t(metric.label)}</dt>
                        <dd className="ui-type-block-title mt-0.5 truncate text-foreground">
                          {metric.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <dl className="grid gap-2 sm:grid-cols-3">
                    {project.secondaryTokenMetrics.map((metric) => (
                      <div
                        key={metric.key}
                        className="min-w-0 rounded-md border border-border/42 bg-[color:color-mix(in_oklch,var(--control-surface)_44%,transparent)] px-2 py-1.5"
                      >
                        <dt className="ui-type-meta truncate text-muted-foreground/58">
                          {t(metric.label)}
                        </dt>
                        <dd className="ui-type-meta mt-0.5 truncate text-foreground">
                          {metric.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {model.providerStatuses.length > 0 ? (
        <div className="control-panel-muted rounded-lg px-4 py-4">
          <div className="flex items-center gap-3">
            <CircleAlert className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <div className="ui-type-label text-muted-foreground/72">{t('Provider Coverage')}</div>
            <div className="h-px flex-1 bg-border/50" />
            <span className="control-chip">{model.providerIssueCountLabel}</span>
          </div>
          <div className="grid gap-2">
            {model.providerStatuses.map((status) => (
              <div
                key={status.key}
                className={cn(
                  'rounded-md border border-border/45 bg-[color:color-mix(in_oklch,var(--control-surface)_44%,transparent)] px-3 py-2',
                  status.tone === 'warning' &&
                    'border-warning/36 bg-warning/10 text-warning-foreground',
                  status.tone === 'destructive' &&
                    'border-destructive/34 bg-destructive/8 text-destructive'
                )}
              >
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="ui-type-block-title min-w-0 break-words">{status.label}</span>
                  <span className="control-chip shrink-0">{t(status.statusLabel)}</span>
                </div>
                {status.reason ? (
                  <p className="ui-type-meta mt-1 min-w-0 break-words text-muted-foreground/72">
                    {t(status.reason)}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
