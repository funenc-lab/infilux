import { FileCode } from 'lucide-react';
import type { FilePanelProps } from '@/components/files/FilePanel';
import { useI18n } from '@/i18n';
import { DeferredPanelFallback } from './DeferredPanelFallback';
import { DeferredPanelLoadError } from './DeferredPanelLoadError';
import { useDeferredComponentLoader } from './useDeferredComponentLoader';
import { useDeferredReady } from './useDeferredReady';

type FilePanelComponent = React.ComponentType<FilePanelProps>;
type FilePanelModule = typeof import('@/components/files/FilePanel');

function loadFilePanelModule(): Promise<FilePanelModule> {
  return import('@/components/files/FilePanel');
}

function selectFilePanelComponent(module: FilePanelModule): FilePanelComponent {
  return module.FilePanel as FilePanelComponent;
}

interface DeferredFilePanelProps extends FilePanelProps {
  shouldLoad?: boolean;
  showFallback?: boolean;
  onReady?: () => void;
}

export function DeferredFilePanel({
  shouldLoad = true,
  showFallback = true,
  onReady,
  ...panelProps
}: DeferredFilePanelProps) {
  const { t } = useI18n();
  const { Component, error, retry } = useDeferredComponentLoader<FilePanelModule, FilePanelProps>({
    shouldLoad,
    load: loadFilePanelModule,
    selectComponent: selectFilePanelComponent,
    errorLabel: 'FilePanel',
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
      title={t('Loading file explorer')}
      description={t('Preparing file tree and editor workspace')}
    />
  );
}
