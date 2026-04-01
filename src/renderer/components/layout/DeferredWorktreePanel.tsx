import { GitBranch } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { WorktreePanelProps } from '@/components/layout/WorktreePanel';
import { useI18n } from '@/i18n';
import { DeferredPanelFallback } from './DeferredPanelFallback';
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
  const [Component, setComponent] = useState<WorktreePanelComponent | null>(null);

  useEffect(() => {
    if (!shouldLoad || Component) {
      return;
    }

    let cancelled = false;
    import('@/components/layout/WorktreePanel').then((module) => {
      if (cancelled) {
        return;
      }
      setComponent(() => module.WorktreePanel as WorktreePanelComponent);
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
      eyebrow={t('Worktrees')}
      title={t('Loading worktrees')}
      description={t('Preparing branches, worktree status, and session context')}
    />
  );
}
