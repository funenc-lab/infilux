import { RectangleEllipsis } from 'lucide-react';
import type { MainContentProps } from '@/components/layout/MainContent';
import { useI18n } from '@/i18n';
import { DeferredPanelFallback } from './DeferredPanelFallback';
import { useDeferredComponentLoader } from './useDeferredComponentLoader';

type MainContentComponent = React.ComponentType<MainContentProps>;

interface DeferredMainContentProps extends MainContentProps {
  shouldLoad?: boolean;
  showFallback?: boolean;
}

export function DeferredMainContent({
  shouldLoad = true,
  showFallback = true,
  ...props
}: DeferredMainContentProps) {
  const { t } = useI18n();
  const { Component } = useDeferredComponentLoader<
    typeof import('@/components/layout/MainContent'),
    MainContentProps
  >({
    shouldLoad,
    loadStrategy: 'idle',
    load: () => import('@/components/layout/MainContent'),
    selectComponent: (module) => module.MainContent as MainContentComponent,
    errorLabel: 'MainContent',
  });

  if (Component) {
    return <Component {...props} />;
  }

  if (!showFallback) {
    return null;
  }

  return (
    <div className="flex min-w-0 flex-1 overflow-hidden">
      <DeferredPanelFallback
        icon={<RectangleEllipsis className="h-5 w-5" />}
        eyebrow={t('Workspace')}
        title={t('Loading workspace')}
        description={t('Preparing main surfaces, navigation state, and active context')}
        className="min-w-0 flex-1"
      />
    </div>
  );
}
