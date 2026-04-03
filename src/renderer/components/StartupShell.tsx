import type { Locale } from '@shared/i18n';
import { useEffect, useState } from 'react';
import { DeferredPanelFallback } from '@/components/layout/DeferredPanelFallback';
import { resolveBootstrapLocale } from '@/lib/bootstrapLocale';
import { resolveStartupShellContent } from './startupShellContent';

const STARTUP_STAGE_EVENT = 'infilux-bootstrap-stage-change';

function readBootstrapStageFromWindow(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return (
    (
      window as Window & {
        __infiluxBootstrapStage?: string;
      }
    ).__infiluxBootstrapStage ?? null
  );
}

interface StartupShellProps {
  description?: string;
  locale?: Locale;
  progressLabel?: string;
  progressMax?: number;
  progressValue?: number;
  stage?: string | null;
  title?: string;
}

export function StartupShell({
  description: controlledDescription,
  stage: controlledStage,
  locale: controlledLocale,
  progressLabel: controlledProgressLabel,
  progressMax: controlledProgressMax,
  progressValue: controlledProgressValue,
  title: controlledTitle,
}: StartupShellProps) {
  const [liveStage, setLiveStage] = useState<string | null>(
    () => controlledStage ?? readBootstrapStageFromWindow()
  );

  useEffect(() => {
    if (controlledStage !== undefined) {
      setLiveStage(controlledStage);
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    const handleStageChange = (event: Event) => {
      const nextStage =
        event instanceof CustomEvent && typeof event.detail === 'string'
          ? event.detail
          : readBootstrapStageFromWindow();
      setLiveStage(nextStage ?? null);
    };

    window.addEventListener(STARTUP_STAGE_EVENT, handleStageChange);
    setLiveStage(readBootstrapStageFromWindow());
    return () => {
      window.removeEventListener(STARTUP_STAGE_EVENT, handleStageChange);
    };
  }, [controlledStage]);

  const copy = resolveStartupShellContent(
    controlledStage ?? liveStage,
    controlledLocale ?? resolveBootstrapLocale()
  );
  const title = controlledTitle ?? copy.title;
  const description = controlledDescription ?? copy.description;
  const progressLabel = controlledProgressLabel ?? copy.progressLabel;
  const progressMax = controlledProgressMax ?? copy.progressMax;
  const progressValue = controlledProgressValue ?? copy.progressValue;

  return (
    <div className="relative flex min-h-screen items-start justify-start overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,_rgba(255,255,255,0.03),_transparent_22%),radial-gradient(circle_at_top_left,_rgba(120,140,180,0.12),_transparent_38%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-border/72 to-transparent" />
      <DeferredPanelFallback
        variant="startup"
        icon={
          <div className="relative flex h-4.5 w-4.5 items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-primary/16" />
            <span className="h-2 w-2 rounded-full bg-primary/88" />
          </div>
        }
        eyebrow="Infilux"
        title={title}
        description={description}
        progressLabel={progressLabel}
        progressMax={progressMax}
        progressValue={progressValue}
        className="relative min-h-screen w-full"
      />
    </div>
  );
}
