import { RectangleEllipsis } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { MainContentProps } from '@/components/layout/MainContent';
import { useI18n } from '@/i18n';
import { DeferredPanelFallback } from './DeferredPanelFallback';

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
  const [Component, setComponent] = useState<MainContentComponent | null>(null);

  useEffect(() => {
    if (!shouldLoad || Component) {
      return;
    }

    let cancelled = false;
    import('@/components/layout/MainContent').then((module) => {
      if (cancelled) {
        return;
      }
      setComponent(() => module.MainContent as MainContentComponent);
    });

    return () => {
      cancelled = true;
    };
  }, [shouldLoad, Component]);

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
