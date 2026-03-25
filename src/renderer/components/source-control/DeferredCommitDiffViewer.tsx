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
        <Empty className="h-full border-0">
          <EmptyMedia variant="icon">
            <FileCode className="h-4.5 w-4.5" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{t('Select a file to view changes')}</EmptyTitle>
            <EmptyDescription>{t('Choose a commit file to open the diff view')}</EmptyDescription>
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
          <EmptyTitle>{t('Loading commit diff')}</EmptyTitle>
          <EmptyDescription>{t('Preparing the commit diff runtime')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
);
