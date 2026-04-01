import { GitBranch } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { SourceControlPanelProps } from '@/components/source-control/SourceControlPanel';
import { useI18n } from '@/i18n';
import { DeferredPanelFallback } from './DeferredPanelFallback';
import { useDeferredReady } from './useDeferredReady';

type SourceControlPanelComponent = React.ComponentType<SourceControlPanelProps>;

interface DeferredSourceControlPanelProps extends SourceControlPanelProps {
  shouldLoad?: boolean;
  onReady?: () => void;
}

export function DeferredSourceControlPanel({
  shouldLoad = true,
  onReady,
  ...props
}: DeferredSourceControlPanelProps) {
  const { t } = useI18n();
  const [Component, setComponent] = useState<SourceControlPanelComponent | null>(null);

  useEffect(() => {
    if (!shouldLoad || Component) {
      return;
    }

    let cancelled = false;
    import('@/components/source-control/SourceControlPanel').then((module) => {
      if (cancelled) {
        return;
      }
      setComponent(() => module.SourceControlPanel as SourceControlPanelComponent);
    });

    return () => {
      cancelled = true;
    };
  }, [shouldLoad, Component]);

  useDeferredReady(Boolean(Component), onReady);

  if (Component) {
    return <Component {...props} />;
  }

  return (
    <DeferredPanelFallback
      icon={<GitBranch className="h-5 w-5" />}
      eyebrow={t('Version Control')}
      title={t('Loading version control')}
      description={t('Preparing repository status and diff tools')}
    />
  );
}
