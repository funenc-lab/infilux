import type { CSSProperties, ReactNode } from 'react';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';
import { buildConsoleTypographyModel } from './consoleTypography';

interface ControlStateCardProps {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  metaLabel?: string;
  metaValue?: string;
  actions?: ReactNode;
  className?: string;
  cardClassName?: string;
}

export function ControlStateCard({
  icon,
  eyebrow,
  title,
  description,
  metaLabel,
  metaValue,
  actions,
  className,
  cardClassName,
}: ControlStateCardProps) {
  const appFontFamily = useSettingsStore((state) => state.fontFamily);
  const appFontSize = useSettingsStore((state) => state.fontSize);
  const editorSettings = useSettingsStore((state) => state.editorSettings);

  const typography = useMemo(
    () =>
      buildConsoleTypographyModel({
        appFontFamily,
        appFontSize,
        editorFontFamily: editorSettings?.fontFamily,
        editorFontSize: editorSettings?.fontSize,
        editorLineHeight: editorSettings?.lineHeight,
      }),
    [appFontFamily, appFontSize, editorSettings]
  );

  const rootStyle = useMemo<CSSProperties>(
    () => ({
      fontFamily: typography.fontFamily,
      fontSize: `${typography.fontSize}px`,
    }),
    [typography.fontFamily, typography.fontSize]
  );
  const labelStyle = useMemo<CSSProperties>(
    () => ({
      lineHeight: `${typography.labelLineHeight}px`,
    }),
    [typography.labelLineHeight]
  );
  const titleStyle = useMemo<CSSProperties>(
    () => ({
      lineHeight: `${typography.titleLineHeight}px`,
    }),
    [typography.titleLineHeight]
  );
  const bodyStyle = useMemo<CSSProperties>(
    () => ({
      lineHeight: `${typography.bodyLineHeight}px`,
    }),
    [typography.bodyLineHeight]
  );

  return (
    <div
      className={cn('flex h-full items-start justify-center px-6 pb-6 pt-12 sm:pt-16', className)}
    >
      <div
        className={cn(
          'control-panel relative w-full max-w-[min(60rem,100%)] overflow-hidden rounded-[24px] px-5 py-5 sm:px-6 sm:py-6',
          cardClassName
        )}
        style={rootStyle}
      >
        <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-linear-to-r from-transparent via-border/70 to-transparent" />
        <div className="flex min-w-0 items-start gap-4 sm:gap-5">
          <div className="control-panel-muted mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.95rem] text-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--foreground)_5%,transparent)]">
            <div className="text-[0.98em]">{icon}</div>
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="text-[0.72em] font-semibold uppercase tracking-[0.18em] text-muted-foreground/92"
              style={labelStyle}
            >
              {eyebrow}
            </div>
            <h2
              className="mt-2 max-w-[24ch] text-balance text-[1.24rem] font-semibold tracking-[-0.034em] text-foreground sm:text-[1.44rem]"
              style={titleStyle}
            >
              {title}
            </h2>
            <p
              className="mt-2.5 max-w-[52ch] text-[0.93rem] text-muted-foreground/94"
              style={bodyStyle}
            >
              {description}
            </p>
            {metaLabel && metaValue ? (
              <div className="mt-4 flex min-w-0 items-start gap-2 text-[0.75em] leading-5 text-muted-foreground/84">
                <span className="shrink-0 font-semibold uppercase tracking-[0.14em] text-muted-foreground/66">
                  {metaLabel}
                </span>
                <span className="min-w-0 text-pretty text-foreground/80">{metaValue}</span>
              </div>
            ) : null}
            {actions ? (
              <div className="mt-6 border-t border-border/70 pt-4">
                <div className="flex flex-wrap items-center gap-3">{actions}</div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
