import { GitBranch } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { TreeSidebarProps } from '@/components/layout/TreeSidebar';
import { useI18n } from '@/i18n';
import { DeferredPanelFallback } from './DeferredPanelFallback';
import { useDeferredReady } from './useDeferredReady';

type TreeSidebarComponent = React.ComponentType<TreeSidebarProps>;

interface DeferredTreeSidebarProps extends TreeSidebarProps {
  shouldLoad?: boolean;
  showFallback?: boolean;
  onReady?: () => void;
}

export function DeferredTreeSidebar({
  shouldLoad = true,
  showFallback = true,
  onReady,
  ...panelProps
}: DeferredTreeSidebarProps) {
  const { t } = useI18n();
  const [Component, setComponent] = useState<TreeSidebarComponent | null>(null);

  useEffect(() => {
    if (!shouldLoad || Component) {
      return;
    }

    let cancelled = false;
    import('@/components/layout/TreeSidebar').then((module) => {
      if (cancelled) {
        return;
      }
      setComponent(() => module.TreeSidebar as TreeSidebarComponent);
    });

    return () => {
      cancelled = true;
    };
  }, [shouldLoad, Component]);

  useDeferredReady(Boolean(Component), onReady);

  if (Component) {
    return <Component {...panelProps} />;
  }

  if (!showFallback) {
    return null;
  }

  return (
    <DeferredPanelFallback
      icon={<GitBranch className="h-5 w-5" />}
      eyebrow={t('Workspace Tree')}
      title={t('Loading workspace tree')}
      description={t('Preparing repositories, worktrees, and activity indicators')}
    />
  );
}
