import { FileCode } from 'lucide-react';
import { forwardRef, useEffect, useState } from 'react';
import { useI18n } from '@/i18n';
import type { DiffViewerProps } from './DiffViewer';
import { DiffViewerStateCard } from './DiffViewerStateCard';

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
        <DiffViewerStateCard
          icon={<FileCode className="h-5 w-5" />}
          eyebrow={t('Diff Viewer')}
          title={t('Select a file to view changes')}
          description={t('Choose a changed file to open the diff view')}
          metaLabel={t('Next Step')}
          metaValue={t('Choose a changed file in the changes list')}
        />
      );
    }

    return (
      <DiffViewerStateCard
        icon={<FileCode className="h-5 w-5" />}
        eyebrow={t('Diff Viewer')}
        title={t('Loading diff viewer')}
        description={t('Preparing the diff runtime')}
        metaLabel={t('Status')}
        metaValue={t('Loading diff runtime')}
      />
    );
  }
);
