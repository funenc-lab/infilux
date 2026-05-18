import { FileCode } from 'lucide-react';
import type { CurrentFilePanelProps } from '@/components/files/CurrentFilePanel';
import { useI18n } from '@/i18n';
import { DeferredPanelFallback } from './DeferredPanelFallback';
import { DeferredPanelLoadError } from './DeferredPanelLoadError';
import { useDeferredComponentLoader } from './useDeferredComponentLoader';
import { useDeferredReady } from './useDeferredReady';

type CurrentFilePanelComponent = React.ComponentType<CurrentFilePanelProps>;
type CurrentFilePanelModule = typeof import('@/components/files/CurrentFilePanel');

let cachedCurrentFilePanelComponent: CurrentFilePanelComponent | null = null;

function loadCurrentFilePanelModule(): Promise<CurrentFilePanelModule> {
  return import('@/components/files/CurrentFilePanel');
}

function getCachedCurrentFilePanelComponent(): CurrentFilePanelComponent | null {
  return cachedCurrentFilePanelComponent;
}

function setCachedCurrentFilePanelComponent(component: CurrentFilePanelComponent): void {
  cachedCurrentFilePanelComponent = component;
}

function selectCurrentFilePanelComponent(
  module: CurrentFilePanelModule
): CurrentFilePanelComponent {
  return module.CurrentFilePanel as CurrentFilePanelComponent;
}

interface DeferredCurrentFilePanelProps extends CurrentFilePanelProps {
  shouldLoad?: boolean;
  showFallback?: boolean;
  onReady?: () => void;
}

export function DeferredCurrentFilePanel({
  shouldLoad = true,
  showFallback = true,
  onReady,
  ...panelProps
}: DeferredCurrentFilePanelProps) {
  const { t } = useI18n();
  const { Component, error, retry } = useDeferredComponentLoader<
    CurrentFilePanelModule,
    CurrentFilePanelProps
  >({
    shouldLoad,
    load: loadCurrentFilePanelModule,
    selectComponent: selectCurrentFilePanelComponent,
    getCachedComponent: getCachedCurrentFilePanelComponent,
    setCachedComponent: setCachedCurrentFilePanelComponent,
    errorLabel: 'CurrentFilePanel',
  });

  useDeferredReady(Boolean(Component), onReady);

  if (Component) {
    return <Component {...panelProps} />;
  }

  if (!showFallback) {
    return null;
  }

  if (error) {
    return (
      <DeferredPanelLoadError
        eyebrow={t('File Explorer')}
        title={t('Unable to load file')}
        description={t('Unable to load resources.')}
        error={error}
        onRetry={retry}
      />
    );
  }

  return (
    <DeferredPanelFallback
      icon={<FileCode className="h-5 w-5" />}
      eyebrow={t('File Explorer')}
      title={t('Loading editor')}
      description={t('Preparing active file workspace')}
    />
  );
}
