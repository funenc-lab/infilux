import { FileCode } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CurrentFilePanelProps } from '@/components/files/CurrentFilePanel';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { useI18n } from '@/i18n';

type CurrentFilePanelComponent = React.ComponentType<CurrentFilePanelProps>;

interface DeferredCurrentFilePanelProps extends CurrentFilePanelProps {
  shouldLoad?: boolean;
}

export function DeferredCurrentFilePanel({
  shouldLoad = true,
  ...props
}: DeferredCurrentFilePanelProps) {
  const { t } = useI18n();
  const [Component, setComponent] = useState<CurrentFilePanelComponent | null>(null);

  useEffect(() => {
    if (!shouldLoad || Component) {
      return;
    }

    let cancelled = false;
    import('@/components/files/CurrentFilePanel').then((module) => {
      if (cancelled) {
        return;
      }
      setComponent(() => module.CurrentFilePanel as CurrentFilePanelComponent);
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
        <FileCode className="h-4.5 w-4.5" />
      </EmptyMedia>
      <EmptyHeader>
        <EmptyTitle>{t('Loading editor')}</EmptyTitle>
        <EmptyDescription>{t('Preparing active file workspace')}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
