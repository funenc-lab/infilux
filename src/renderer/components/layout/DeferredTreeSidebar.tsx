import { GitBranch } from 'lucide-react';
import type { TreeSidebarProps } from '@/components/layout/TreeSidebar';
import { useI18n } from '@/i18n';
import { DeferredPanelFallback } from './DeferredPanelFallback';
import { useDeferredComponentLoader } from './useDeferredComponentLoader';
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
  const { Component } = useDeferredComponentLoader<
    typeof import('@/components/layout/TreeSidebar'),
    TreeSidebarProps
  >({
    shouldLoad,
    loadStrategy: 'idle',
    load: () => import('@/components/layout/TreeSidebar'),
    selectComponent: (module) => module.TreeSidebar as TreeSidebarComponent,
    errorLabel: 'TreeSidebar',
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
      icon={<GitBranch className="h-5 w-5" />}
      eyebrow={t('Workspace Tree')}
      title={t('Loading workspace tree')}
      description={t('Preparing repositories, worktrees, and activity indicators')}
    />
  );
}
