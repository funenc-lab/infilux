import type { ReactNode } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { ControlStateCard } from './ControlStateCard';

export type DeferredPanelFallbackVariant = 'embedded' | 'fullscreen' | 'startup';

export interface DeferredPanelFallbackProps {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  progressLabel?: string;
  progressMax?: number;
  progressValue?: number;
  footer?: ReactNode;
  className?: string;
  cardClassName?: string;
  variant?: DeferredPanelFallbackVariant;
}

export function DeferredPanelFallback({
  icon,
  eyebrow,
  title,
  description,
  progressLabel,
  progressMax,
  progressValue,
  footer,
  className,
  cardClassName,
  variant = 'embedded',
}: DeferredPanelFallbackProps) {
  const hasProgress =
    typeof progressValue === 'number' && typeof progressMax === 'number' && progressMax > 0;
  const normalizedProgressValue = hasProgress
    ? Math.min(Math.max(progressValue, 0), progressMax)
    : null;
  const progressPercent =
    hasProgress && normalizedProgressValue !== null
      ? (normalizedProgressValue / progressMax) * 100
      : 0;
  const progressText =
    hasProgress && normalizedProgressValue !== null
      ? `${progressLabel ?? title} (${normalizedProgressValue} of ${progressMax})`
      : null;

  const fullscreenFooter = (
    <div className="flex items-center gap-3 text-[0.76em] text-muted-foreground/78">
      <Spinner
        className="h-3.5 w-3.5 text-primary/82 motion-reduce:animate-none"
        aria-hidden="true"
      />
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted/72">
        <div className="h-full w-2/5 rounded-full bg-primary/78 motion-safe:animate-pulse motion-reduce:animate-none" />
      </div>
    </div>
  );

  const statusDockFooter =
    hasProgress && normalizedProgressValue !== null ? (
      <div className="max-w-[22rem]">
        <div
          data-startup-progress-label="true"
          className={cn(
            'flex items-center justify-between gap-4 text-[0.72rem] uppercase tracking-[0.16em] text-muted-foreground/68',
            variant === 'startup' && 'sr-only'
          )}
        >
          <span className="min-w-0 flex-1 truncate">{progressLabel ?? title}</span>
          <span className="shrink-0">
            {normalizedProgressValue}/{progressMax}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={progressLabel ?? title}
          aria-valuemin={0}
          aria-valuemax={progressMax}
          aria-valuenow={normalizedProgressValue}
          aria-valuetext={progressText ?? undefined}
          className={cn(
            'h-1.5 overflow-hidden rounded-full bg-muted/54',
            variant === 'startup' ? 'mt-0' : 'mt-3'
          )}
        >
          <div
            className="h-full rounded-full bg-primary/72"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    ) : (
      <div className="flex max-w-[20rem] items-center gap-4 text-[0.72rem] uppercase tracking-[0.16em] text-muted-foreground/68">
        <div className="h-px w-10 bg-border/72" />
        <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted/54">
          <div className="h-full w-2/5 rounded-full bg-primary/72 motion-safe:animate-pulse motion-reduce:animate-none" />
        </div>
      </div>
    );

  if (variant === 'embedded') {
    const resolvedFooter = footer ?? statusDockFooter;

    return (
      <div
        aria-busy="true"
        role="status"
        data-deferred-fallback="embedded"
        data-loading-layout="status-dock"
        className={cn(
          'flex h-full min-h-0 items-center justify-center px-5 py-4 sm:px-6 sm:py-5',
          className
        )}
      >
        <div
          className={cn(
            'relative w-full max-w-[30rem] overflow-hidden border border-border/62 bg-background/34 px-4 py-4',
            'shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:px-5 sm:py-4',
            cardClassName
          )}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-border/72 to-transparent" />
          <div className="flex min-w-0 items-start gap-3.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.85rem] border border-border/62 bg-muted/34 text-foreground/88">
              <div className="text-[0.92em]">{icon}</div>
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground/74">
                {eyebrow}
              </div>
              <div className="mt-1.5 text-[0.96rem] font-semibold tracking-normal text-foreground/94">
                {title}
              </div>
              <p className="mt-2 max-w-[32rem] text-sm leading-6 text-muted-foreground/88">
                {description}
              </p>
              <div className="mt-4">{resolvedFooter}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'startup') {
    const resolvedFooter = footer ?? statusDockFooter;

    return (
      <div
        aria-busy="true"
        role="status"
        data-startup-fallback="true"
        data-startup-layout="status-dock"
        data-loading-layout="status-dock"
        className={cn('flex min-h-screen items-center justify-center p-6', className)}
      >
        <div
          className={cn(
            'relative w-full max-w-[36rem] overflow-hidden border border-border/62 bg-background/34 px-5 py-5',
            'shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]',
            cardClassName
          )}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-border/72 to-transparent" />
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/62 bg-muted/34 text-foreground/88">
              <div className="text-base">{icon}</div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground/74">
                {eyebrow}
              </div>
              <div className="mt-0 text-[19px] font-semibold leading-[1.2] tracking-[-0.03em] text-foreground">
                {title}
              </div>
              <p className="mt-2 max-w-[34rem] text-sm leading-[1.6] text-muted-foreground/88">
                {description}
              </p>
              <div className="mt-5">{resolvedFooter}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const resolvedFooter = footer ?? fullscreenFooter;

  return (
    <ControlStateCard
      icon={icon}
      eyebrow={eyebrow}
      title={title}
      description={description}
      footer={resolvedFooter}
      className={className}
      cardClassName={cardClassName}
    />
  );
}
