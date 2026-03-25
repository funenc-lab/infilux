import { FileCode } from 'lucide-react';
import { forwardRef, useEffect, useState } from 'react';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { useI18n } from '@/i18n';
import type { DiffViewerProps } from './DiffViewer';

type DiffViewerComponent = React.ComponentType<DiffViewerProps>;

interface DeferredDiffViewerProps extends DiffViewerProps {
  shouldLoad?: boolean;
}

export const DeferredDiffViewer = forwardRef<unknown, DeferredDiffViewerProps>(
  function DeferredDiffViewer({ shouldLoad = true, ...props }, _ref) {
    const { t } = useI18n();
    const [DiffViewerComponent, setDiffViewerComponent] = useState<DiffViewerComponent | null>(
      null
    );

    useEffect(() => {
      if (!shouldLoad || DiffViewerComponent) {
        return;
      }

      let cancelled = false;
      import('./DiffViewer').then((module) => {
        if (cancelled) {
          return;
        }
        setDiffViewerComponent(() => module.DiffViewer as DiffViewerComponent);
      });

      return () => {
        cancelled = true;
      };
    }, [shouldLoad, DiffViewerComponent]);

    if (DiffViewerComponent) {
      return <DiffViewerComponent {...props} />;
    }

    if (!shouldLoad) {
      return (
        <Empty className="h-full border-0">
          <EmptyMedia variant="icon">
            <FileCode className="h-4.5 w-4.5" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{t('Select a file to view changes')}</EmptyTitle>
            <EmptyDescription>{t('Choose a changed file to open the diff view')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    return (
      <Empty className="h-full border-0">
        <EmptyMedia variant="icon">
          <FileCode className="h-4.5 w-4.5" />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>{t('Loading diff viewer')}</EmptyTitle>
          <EmptyDescription>{t('Preparing the diff runtime')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
);
