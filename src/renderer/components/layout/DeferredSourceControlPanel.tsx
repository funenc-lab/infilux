import { GitBranch } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { SourceControlPanelProps } from '@/components/source-control/SourceControlPanel';
import { useI18n } from '@/i18n';
import { ControlStateCard } from './ControlStateCard';

type SourceControlPanelComponent = React.ComponentType<SourceControlPanelProps>;

interface DeferredSourceControlPanelProps extends SourceControlPanelProps {
  shouldLoad?: boolean;
}

export function DeferredSourceControlPanel({
  shouldLoad = true,
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

  if (Component) {
    return <Component {...props} />;
  }

  return (
    <ControlStateCard
      icon={<GitBranch className="h-5 w-5" />}
      eyebrow={t('Version Control')}
      title={t('Loading version control')}
      description={t('Preparing repository status and diff tools')}
    />
  );
}
