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

  const startupFooter =
    hasProgress && normalizedProgressValue !== null ? (
      <div className="max-w-[22rem]">
        <div className="flex items-center justify-between gap-4 text-[0.72rem] uppercase tracking-[0.16em] text-muted-foreground/68">
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
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted/54"
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
    return (
      <div
        aria-busy="true"
        role="status"
        className={cn('flex h-full min-h-0 flex-col px-5 py-4 sm:px-6 sm:py-5', className)}
      >
        <div
          className={cn(
            'flex h-full min-h-0 flex-col overflow-hidden rounded-[20px] border border-border/65 bg-background/72',
            'shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]',
            cardClassName
          )}
        >
          <div className="flex items-center gap-3 border-b border-border/65 px-4 py-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-muted/62 text-foreground/86">
              <div className="text-[0.98em]">{icon}</div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground/78">
                {eyebrow}
              </div>
              <div className="mt-1 text-sm font-medium text-foreground/92">{title}</div>
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-4 px-4 py-4">
            <p className="max-w-[54ch] text-sm leading-6 text-muted-foreground/88">{description}</p>
            <div className="grid gap-3">
              <div className="h-2.5 w-36 animate-pulse rounded-full bg-muted/72 motion-reduce:animate-none" />
              <div className="h-10 animate-pulse rounded-2xl bg-muted/56 motion-reduce:animate-none" />
              <div className="h-24 animate-pulse rounded-[18px] bg-muted/38 motion-reduce:animate-none" />
              <div className="h-24 animate-pulse rounded-[18px] bg-muted/28 motion-reduce:animate-none" />
            </div>
            {footer ? (
              <div className="mt-auto">{footer}</div>
            ) : (
              <div className="mt-auto flex items-center gap-3 pt-1 text-[0.76rem] text-muted-foreground/76">
                <div className="h-2 w-2 rounded-full bg-primary/78 motion-safe:animate-pulse motion-reduce:animate-none" />
                <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted/72">
                  <div className="h-full w-2/5 rounded-full bg-primary/72 motion-safe:animate-pulse motion-reduce:animate-none" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'startup') {
    const resolvedFooter = footer ?? startupFooter;

    return (
      <div
        aria-busy="true"
        role="status"
        data-startup-fallback="true"
        data-startup-layout="status-dock"
        className={cn(
          'flex min-h-screen items-center justify-center px-6 py-6 sm:px-8 sm:py-8',
          className
        )}
      >
        <div
          className={cn(
            'relative w-full max-w-[36rem] overflow-hidden border border-border/62 bg-background/34 px-5 py-4',
            'shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:px-6 sm:py-5',
            cardClassName
          )}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-border/72 to-transparent" />
          <div className="flex min-w-0 items-start gap-4 sm:gap-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.95rem] border border-border/62 bg-muted/34 text-foreground/88">
              <div className="text-[0.98em]">{icon}</div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground/74">
                {eyebrow}
              </div>
              <div className="mt-2 text-[1.08rem] font-semibold tracking-[-0.03em] text-foreground sm:text-[1.18rem]">
                {title}
              </div>
              <p className="mt-2 max-w-[34rem] text-sm leading-6 text-muted-foreground/88">
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
