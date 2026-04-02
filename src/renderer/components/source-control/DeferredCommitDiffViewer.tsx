import { FileCode } from 'lucide-react';
import { forwardRef, useEffect, useState } from 'react';
import { useI18n } from '@/i18n';
import type { CommitDiffViewerProps } from './CommitDiffViewer';
import { DiffViewerStateCard } from './DiffViewerStateCard';

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
        <DiffViewerStateCard
          icon={<FileCode className="h-5 w-5" />}
          eyebrow={t('Commit Diff')}
          title={t('Select a file to view changes')}
          description={t('Choose a commit file to open the diff view')}
          metaLabel={t('Next Step')}
          metaValue={t('Choose a file from the commit list')}
        />
      );
    }

    return (
      <DiffViewerStateCard
        icon={<FileCode className="h-5 w-5" />}
        eyebrow={t('Commit Diff')}
        title={t('Loading commit diff')}
        description={t('Preparing the commit diff runtime')}
        metaLabel={t('Status')}
        metaValue={t('Loading commit diff')}
      />
    );
  }
);
