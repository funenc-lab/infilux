import type { FileDiff } from '@shared/types';
import { FileCode, Loader2 } from 'lucide-react';
import { useMemo } from 'react';
import { useI18n } from '@/i18n';
import { DeferredDiffViewer } from './DeferredDiffViewer';
import { DiffViewerStateCard } from './DiffViewerStateCard';

export interface CommitDiffViewerProps {
  rootPath: string;
  fileDiff: FileDiff | null | undefined;
  filePath: string | null;
  isActive?: boolean;
  isLoading?: boolean;
  onPrevFile?: () => void;
  onNextFile?: () => void;
  hasPrevFile?: boolean;
  hasNextFile?: boolean;
}

export function CommitDiffViewer({
  rootPath,
  fileDiff,
  filePath,
  isActive = true,
  isLoading = false,
  onPrevFile,
  onNextFile,
  hasPrevFile = false,
  hasNextFile = false,
}: CommitDiffViewerProps) {
  const { t } = useI18n();

  // Memoize diff data to prevent unnecessary remounts
  const diffData = useMemo(
    () => ({
      path: filePath ?? '',
      original: fileDiff?.original ?? '',
      modified: fileDiff?.modified ?? '',
      isBinary: fileDiff?.isBinary,
    }),
    [filePath, fileDiff]
  );

  // Don't render DiffViewer while loading or without data
  if (isLoading || !filePath || !fileDiff) {
    return isLoading ? (
      <DiffViewerStateCard
        icon={<Loader2 className="h-5 w-5 animate-spin" />}
        eyebrow={t('Commit Diff')}
        title={t('Loading commit diff')}
        description={t('Preparing the selected file diff')}
        metaLabel={t('Status')}
        metaValue={t('Loading selected diff')}
      />
    ) : (
      <DiffViewerStateCard
        icon={<FileCode className="h-5 w-5" />}
        eyebrow={t('Commit Diff')}
        title={t('Select a file to view changes')}
        description={t('Choose a file from the commit list to inspect its diff')}
        metaLabel={t('Next Step')}
        metaValue={t('Choose a file from the commit list')}
      />
    );
  }

  // Only render DiffViewer when we have valid data
  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-hidden">
        <DeferredDiffViewer
          rootPath={rootPath}
          file={{ path: filePath, staged: false }}
          isActive={isActive}
          diff={diffData}
          isCommitView
          shouldLoad={true}
          onPrevFile={onPrevFile}
          onNextFile={onNextFile}
          hasPrevFile={hasPrevFile}
          hasNextFile={hasNextFile}
        />
      </div>
    </div>
  );
}
