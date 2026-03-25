import { FileCode } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FilePanelProps } from '@/components/files/FilePanel';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { useI18n } from '@/i18n';

type FilePanelComponent = React.ComponentType<FilePanelProps>;

interface DeferredFilePanelProps extends FilePanelProps {
  shouldLoad?: boolean;
}

export function DeferredFilePanel({ shouldLoad = true, ...props }: DeferredFilePanelProps) {
  const { t } = useI18n();
  const [Component, setComponent] = useState<FilePanelComponent | null>(null);

  useEffect(() => {
    if (!shouldLoad || Component) {
      return;
    }

    let cancelled = false;
    import('@/components/files/FilePanel').then((module) => {
      if (cancelled) {
        return;
      }
      setComponent(() => module.FilePanel as FilePanelComponent);
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
        <EmptyTitle>{t('Loading file explorer')}</EmptyTitle>
        <EmptyDescription>{t('Preparing file tree and editor workspace')}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
