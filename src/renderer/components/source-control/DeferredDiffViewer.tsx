import { FileCode } from 'lucide-react';
import { forwardRef, useEffect, useState } from 'react';
import { ConsoleEmptyState } from '@/components/layout/ConsoleEmptyState';
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
        <div className="flex h-full items-center justify-center p-5">
          <ConsoleEmptyState
            variant="embedded"
            icon={<FileCode className="h-4.5 w-4.5" />}
            eyebrow={t('Diff Viewer')}
            title={t('Select a file to view changes')}
            description={t('Choose a changed file to open the diff view')}
            chips={[{ label: t('Awaiting Selection'), tone: 'wait' }]}
          />
        </div>
      );
    }

    return (
      <div className="flex h-full items-center justify-center p-5">
        <ConsoleEmptyState
          variant="embedded"
          icon={<FileCode className="h-4.5 w-4.5" />}
          eyebrow={t('Diff Viewer')}
          title={t('Loading diff viewer')}
          description={t('Preparing the diff runtime')}
          chips={[{ label: t('Loading'), tone: 'wait' }]}
        />
      </div>
    );
  }
);
