import { GitBranch } from 'lucide-react';
import type { WorktreePanelProps } from '@/components/layout/WorktreePanel';
import { useI18n } from '@/i18n';
import { DeferredPanelFallback } from './DeferredPanelFallback';
import { useDeferredComponentLoader } from './useDeferredComponentLoader';
import { useDeferredReady } from './useDeferredReady';

type WorktreePanelComponent = React.ComponentType<WorktreePanelProps>;

interface DeferredWorktreePanelProps extends WorktreePanelProps {
  shouldLoad?: boolean;
  showFallback?: boolean;
  onReady?: () => void;
}

export function DeferredWorktreePanel({
  shouldLoad = true,
  showFallback = true,
  onReady,
  ...panelProps
}: DeferredWorktreePanelProps) {
  const { t } = useI18n();
  const { Component } = useDeferredComponentLoader<
    typeof import('@/components/layout/WorktreePanel'),
    WorktreePanelProps
  >({
    shouldLoad,
    loadStrategy: 'idle',
    load: () => import('@/components/layout/WorktreePanel'),
    selectComponent: (module) => module.WorktreePanel as WorktreePanelComponent,
    errorLabel: 'WorktreePanel',
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
      eyebrow={t('Worktrees')}
      title={t('Loading worktrees')}
      description={t('Preparing branches, worktree status, and session context')}
    />
  );
}
