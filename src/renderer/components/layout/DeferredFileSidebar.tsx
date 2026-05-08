import { FileCode } from 'lucide-react';
import type { FileSidebarProps } from '@/components/files/FileSidebar';
import { useI18n } from '@/i18n';
import { DeferredPanelFallback } from './DeferredPanelFallback';
import { DeferredPanelLoadError } from './DeferredPanelLoadError';
import { useDeferredComponentLoader } from './useDeferredComponentLoader';
import { useDeferredReady } from './useDeferredReady';

type FileSidebarComponent = React.ComponentType<FileSidebarProps>;
type FileSidebarModule = typeof import('@/components/files/FileSidebar');

function loadFileSidebarModule(): Promise<FileSidebarModule> {
  return import('@/components/files/FileSidebar');
}

function selectFileSidebarComponent(module: FileSidebarModule): FileSidebarComponent {
  return module.FileSidebar as FileSidebarComponent;
}

interface DeferredFileSidebarProps extends FileSidebarProps {
  shouldLoad?: boolean;
  showFallback?: boolean;
  onReady?: () => void;
}

export function DeferredFileSidebar({
  shouldLoad = true,
  showFallback = true,
  onReady,
  ...panelProps
}: DeferredFileSidebarProps) {
  const { t } = useI18n();
  const { Component, error, retry } = useDeferredComponentLoader<
    FileSidebarModule,
    FileSidebarProps
  >({
    shouldLoad,
    load: loadFileSidebarModule,
    selectComponent: selectFileSidebarComponent,
    errorLabel: 'FileSidebar',
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
        title={t('Unable to load file explorer')}
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
