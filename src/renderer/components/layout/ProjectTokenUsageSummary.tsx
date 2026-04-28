import type { ProjectTokenUsageSnapshot } from '@shared/types';
import { AlertTriangle, FolderGit2 } from 'lucide-react';
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
  const { t } = useI18n();
  const model = useMemo(() => buildProjectTokenUsageSummaryModel(snapshot), [snapshot]);

  if (loading && !snapshot) {
    return null;
  }

  return (
    <section
      className="control-panel-muted rounded-lg px-4 py-4"
      aria-busy={loading ? true : undefined}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="ui-type-label text-muted-foreground/72">{t('Project Totals')}</div>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="ui-type-title-lg text-foreground">{model.totalTokensLabel}</span>
            <span className="ui-type-meta text-muted-foreground/78">{model.projectCountLabel}</span>
            <span className="ui-type-meta text-muted-foreground/78">{model.sessionCountLabel}</span>
            <span className="ui-type-meta text-muted-foreground/78">
              {model.providerIssueCountLabel}
            </span>
          </div>
        </div>
      </div>

      {model.hasUsage ? (
        <dl className="mt-4 grid gap-y-3 border-y border-border/55 py-3 sm:grid-cols-4 sm:divide-x sm:divide-border/45">
          {model.summaryMetrics.map((metric) => (
            <div key={metric.key} className="min-w-0 sm:px-3 sm:first:pl-0 sm:last:pr-0">
              <dt className="ui-type-meta text-muted-foreground/64">{t(metric.label)}</dt>
              <dd className="ui-type-block-title mt-1 truncate text-foreground">{metric.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {errorMessage ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/8 px-3 py-2 text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="ui-type-meta min-w-0 break-words">{errorMessage}</p>
        </div>
      ) : null}

      {!loading && !errorMessage && model.projects.length === 0 ? (
        <div className="ui-type-meta mt-4 rounded-md border border-border/45 bg-[color:color-mix(in_oklch,var(--control-surface)_50%,transparent)] px-3 py-2 text-muted-foreground/78">
          {t('No token usage has been recorded for tracked providers.')}
        </div>
      ) : null}

      {model.projects.length > 0 ? (
        <div className="mt-5 space-y-3.5">
          <div className="flex items-center gap-3">
            <div className="ui-type-label text-muted-foreground/72">{t('Tracked Projects')}</div>
            <div className="h-px flex-1 bg-border/50" />
            <span className="control-chip">{model.projectCountLabel}</span>
          </div>

          <div className="divide-y divide-border/55">
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

                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[color:color-mix(in_oklch,var(--border)_46%,transparent)]">
                  <div
                    className="h-full rounded-full bg-[color:color-mix(in_oklch,var(--primary)_64%,var(--support)_36%)]"
                    style={{ width: project.shareWidth }}
                  />
                </div>

                <dl className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-4">
                  {project.tokenMetrics.map((metric) => (
                    <div key={metric.key} className="min-w-0">
                      <dt className="ui-type-meta text-muted-foreground/60">{t(metric.label)}</dt>
                      <dd className="ui-type-block-title mt-0.5 truncate text-foreground">
                        {metric.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {model.providerStatuses.length > 0 ? (
        <div className="mt-5 space-y-3 border-t border-border/55 pt-4">
          <div className="flex items-center gap-3">
            <div className="ui-type-label text-muted-foreground/72">{t('Provider Coverage')}</div>
            <div className="h-px flex-1 bg-border/50" />
            <span className="control-chip">{model.providerIssueCountLabel}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {model.providerStatuses.map((status) => (
              <span
                key={status.key}
                className={cn(
                  'control-chip',
                  status.tone === 'warning' &&
                    'border-warning/36 bg-warning/10 text-warning-foreground',
                  status.tone === 'destructive' &&
                    'border-destructive/34 bg-destructive/8 text-destructive'
                )}
                title={status.reason}
              >{`${status.label}: ${status.statusLabel}`}</span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
