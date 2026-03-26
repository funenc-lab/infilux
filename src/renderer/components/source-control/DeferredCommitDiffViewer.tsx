import { FileCode } from 'lucide-react';
import { forwardRef, useEffect, useState } from 'react';
import { ConsoleEmptyState } from '@/components/layout/ConsoleEmptyState';
import { useI18n } from '@/i18n';
import type { CommitDiffViewerProps } from './CommitDiffViewer';

type CommitDiffViewerComponent = React.ComponentType<CommitDiffViewerProps>;

interface DeferredCommitDiffViewerProps extends CommitDiffViewerProps {
  shouldLoad?: boolean;
}

export const DeferredCommitDiffViewer = forwardRef<unknown, DeferredCommitDiffViewerProps>(
  function DeferredCommitDiffViewer({ shouldLoad = true, ...props }, _ref) {
    const { t } = useI18n();
    const [CommitDiffViewerComponent, setCommitDiffViewerComponent] =
      useState<CommitDiffViewerComponent | null>(null);

    useEffect(() => {
      if (!shouldLoad || CommitDiffViewerComponent) {
        return;
      }

      let cancelled = false;
      import('./CommitDiffViewer').then((module) => {
        if (cancelled) {
          return;
        }
        setCommitDiffViewerComponent(() => module.CommitDiffViewer as CommitDiffViewerComponent);
      });

      return () => {
        cancelled = true;
      };
    }, [shouldLoad, CommitDiffViewerComponent]);

    if (CommitDiffViewerComponent) {
      return <CommitDiffViewerComponent {...props} />;
    }

    if (!shouldLoad) {
      return (
        <div className="flex h-full items-center justify-center p-5">
          <ConsoleEmptyState
            variant="embedded"
            icon={<FileCode className="h-4.5 w-4.5" />}
            eyebrow={t('Commit Diff')}
            title={t('Select a file to view changes')}
            description={t('Choose a commit file to open the diff view')}
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
          eyebrow={t('Commit Diff')}
          title={t('Loading commit diff')}
          description={t('Preparing the commit diff runtime')}
          chips={[{ label: t('Loading'), tone: 'wait' }]}
        />
      </div>
    );
  }
);
