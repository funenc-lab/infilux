import { GitBranch } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { SourceControlPanelProps } from '@/components/source-control/SourceControlPanel';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { useI18n } from '@/i18n';

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
    <Empty className="h-full border-0">
      <EmptyMedia variant="icon">
        <GitBranch className="h-4.5 w-4.5" />
      </EmptyMedia>
      <EmptyHeader>
        <EmptyTitle>{t('Loading version control')}</EmptyTitle>
        <EmptyDescription>{t('Preparing repository status and diff tools')}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
