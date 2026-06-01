import { Terminal } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { TerminalPanelProps } from '@/components/terminal/TerminalPanel';
import { useI18n } from '@/i18n';
import { DeferredPanelFallback } from './DeferredPanelFallback';
import { useDeferredReady } from './useDeferredReady';

type TerminalPanelComponent = React.ComponentType<TerminalPanelProps>;

let cachedTerminalPanelComponent: TerminalPanelComponent | null = null;
let terminalPanelComponentPromise: Promise<TerminalPanelComponent> | null = null;

function loadTerminalPanelComponent(): Promise<TerminalPanelComponent> {
  if (cachedTerminalPanelComponent) {
    return Promise.resolve(cachedTerminalPanelComponent);
  }

  terminalPanelComponentPromise ??= import('@/components/terminal/TerminalPanel')
    .then((module) => {
      cachedTerminalPanelComponent = module.TerminalPanel as TerminalPanelComponent;
      return cachedTerminalPanelComponent;
    })
    .catch((error: unknown) => {
      terminalPanelComponentPromise = null;
      throw error;
    });

  return terminalPanelComponentPromise;
}

interface DeferredTerminalPanelProps extends TerminalPanelProps {
  shouldLoad?: boolean;
  showFallback?: boolean;
  onReady?: () => void;
}

export function DeferredTerminalPanel({
  shouldLoad = true,
  showFallback = true,
  onReady,
  ...props
}: DeferredTerminalPanelProps) {
  const { t } = useI18n();
  const [Component, setComponent] = useState<TerminalPanelComponent | null>(
    () => cachedTerminalPanelComponent
  );

  useEffect(() => {
    if (!shouldLoad || Component) {
      return;
    }

    let cancelled = false;
    loadTerminalPanelComponent()
      .then((LoadedComponent) => {
        if (cancelled) {
          return;
        }
        setComponent(() => LoadedComponent);
      })
      .catch((error: unknown) => {
        console.error('[DeferredTerminalPanel] Failed to load TerminalPanel', error);
      });

    return () => {
      cancelled = true;
    };
  }, [shouldLoad, Component]);

  useDeferredReady(Boolean(Component), onReady);

  if (Component) {
    return <Component {...props} />;
  }

  if (!showFallback) {
    return null;
  }

  return (
    <DeferredPanelFallback
      icon={<Terminal className="h-5 w-5" />}
      eyebrow={t('Terminal Console')}
      title={t('Loading terminal')}
      description={t('Preparing shell sessions and terminal workspace')}
    />
  );
}
