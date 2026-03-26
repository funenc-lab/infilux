import type { CSSProperties, ReactNode } from 'react';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';
import { buildConsoleTypographyModel } from './consoleTypography';

type ConsoleTone = 'default' | 'strong' | 'live' | 'wait' | 'done';

interface ConsoleChip {
  label: string;
  tone?: ConsoleTone;
}

interface ConsoleDetail {
  label: string;
  value: string;
}

interface ConsoleEmptyStateProps {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  chips?: ConsoleChip[];
  details?: ConsoleDetail[];
  detailsLayout?: 'grid' | 'compact';
  actions?: ReactNode;
  className?: string;
  variant?: 'panel' | 'embedded';
}

function getToneClassName(tone: ConsoleTone): string {
  switch (tone) {
    case 'strong':
      return 'control-chip-strong';
    case 'live':
      return 'control-chip-live';
    case 'wait':
      return 'control-chip-wait';
    case 'done':
      return 'control-chip-done';
    default:
      return '';
  }
}

export function ConsoleEmptyState({
  icon,
  eyebrow,
  title,
  description,
  chips = [],
  details = [],
  detailsLayout = 'grid',
  actions,
  className,
  variant = 'panel',
}: ConsoleEmptyStateProps) {
  const isEmbedded = variant === 'embedded';
  const appFontFamily = useSettingsStore((state) => state.fontFamily);
  const appFontSize = useSettingsStore((state) => state.fontSize);
  const editorSettings = useSettingsStore((state) => state.editorSettings);

  const typography = useMemo(
    () =>
      buildConsoleTypographyModel({
        appFontFamily,
        appFontSize,
        editorFontFamily: editorSettings.fontFamily,
        editorFontSize: editorSettings.fontSize,
        editorLineHeight: editorSettings.lineHeight,
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
      className={cn(
        isEmbedded
          ? 'relative w-full max-w-[min(38rem,100%)] rounded-2xl border border-border/70 bg-background/60 px-5 py-5'
          : 'control-panel relative w-full max-w-[min(54rem,100%)] rounded-[28px] px-5 py-5 sm:px-6 sm:py-6',
        className
      )}
      style={rootStyle}
    >
      <div
        className={cn(
          'pointer-events-none absolute inset-x-6 top-0 h-px bg-linear-to-r from-transparent via-border/70 to-transparent',
          isEmbedded && 'inset-x-5'
        )}
      />
      <div className="min-w-0">
        <div className="mb-4 flex items-start gap-3.5 text-muted-foreground">
          <div className="control-panel-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-foreground">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="text-[0.79em] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
              style={labelStyle}
            >
              {eyebrow}
            </div>
            {chips.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {chips.map((chip) => (
                  <span
                    key={`${chip.label}-${chip.tone ?? 'default'}`}
                    className={cn('control-chip', getToneClassName(chip.tone ?? 'default'))}
                  >
                    {chip.label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="min-w-0">
          <h2
            className={cn(
              'max-w-3xl text-balance font-semibold text-foreground',
              isEmbedded
                ? 'text-[1.18rem] tracking-[-0.03em] sm:text-[1.3rem]'
                : 'text-[1.4rem] tracking-[-0.038em] sm:text-[1.72rem]'
            )}
            style={titleStyle}
          >
            {title}
          </h2>
          <p
            className={cn(
              'mt-3 max-w-[60ch] text-muted-foreground',
              isEmbedded ? 'text-[1em]' : 'text-[1.07em]'
            )}
            style={bodyStyle}
          >
            {description}
          </p>
        </div>
      </div>

      {details.length > 0 ? (
        detailsLayout === 'compact' ? (
          <div className="mt-5 flex min-w-0 flex-wrap gap-2.5 border-t border-border/70 pt-4">
            {details.map((detail) => (
              <div
                key={detail.label}
                className="control-panel-muted min-w-0 max-w-full flex-[1_1_11rem] rounded-xl px-3 py-2.5"
              >
                <div
                  className="text-[0.79em] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                  style={labelStyle}
                >
                  {detail.label}
                </div>
                <div
                  className="mt-1.5 whitespace-normal break-words text-[1.07em] text-foreground"
                  style={bodyStyle}
                >
                  {detail.value}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-5 grid gap-x-6 gap-y-3 border-t border-border/70 pt-4 sm:grid-cols-2">
            {details.map((detail) => (
              <div key={detail.label} className="min-w-0">
                <div
                  className="text-[0.79em] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                  style={labelStyle}
                >
                  {detail.label}
                </div>
                <div className="mt-1.5 text-[1.07em] text-foreground" style={bodyStyle}>
                  {detail.value}
                </div>
              </div>
            ))}
          </div>
        )
      ) : null}

      {actions ? <div className="mt-6 flex flex-wrap items-start gap-3">{actions}</div> : null}
    </div>
  );
}
