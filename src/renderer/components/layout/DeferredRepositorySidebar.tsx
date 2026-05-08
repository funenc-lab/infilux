import { FolderGit2 } from 'lucide-react';
import type { RepositorySidebarProps } from '@/components/layout/RepositorySidebar';
import { useI18n } from '@/i18n';
import { DeferredPanelFallback } from './DeferredPanelFallback';
import { useDeferredComponentLoader } from './useDeferredComponentLoader';
import { useDeferredReady } from './useDeferredReady';

type RepositorySidebarComponent = React.ComponentType<RepositorySidebarProps>;

interface DeferredRepositorySidebarProps extends RepositorySidebarProps {
  shouldLoad?: boolean;
  showFallback?: boolean;
  onReady?: () => void;
}

export function DeferredRepositorySidebar({
  shouldLoad = true,
  showFallback = true,
  onReady,
  ...panelProps
}: DeferredRepositorySidebarProps) {
  const { t } = useI18n();
  const { Component } = useDeferredComponentLoader<
    typeof import('@/components/layout/RepositorySidebar'),
    RepositorySidebarProps
  >({
    shouldLoad,
    loadStrategy: 'idle',
    load: () => import('@/components/layout/RepositorySidebar'),
    selectComponent: (module) => module.RepositorySidebar as RepositorySidebarComponent,
    errorLabel: 'RepositorySidebar',
  });

  useDeferredReady(Boolean(Component), onReady);

  if (Component) {
    return <Component {...panelProps} />;
  }

  if (!showFallback) {
    return null;
  }

  return (
    <DeferredPanelFallback
      icon={<FolderGit2 className="h-5 w-5" />}
      eyebrow={t('Repositories')}
      title={t('Loading repositories')}
      description={t('Preparing repository groups and recent workspace state')}
    />
  );
}
