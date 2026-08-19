import { ChevronDown } from 'lucide-react';
import { useI18n } from '@/i18n';

interface RepositoryLoadMoreButtonProps {
  hiddenCount: number;
  nextBatchSize: number;
  onShowMore: () => void;
}

export function RepositoryLoadMoreButton({
  hiddenCount,
  nextBatchSize,
  onShowMore,
}: RepositoryLoadMoreButtonProps) {
  const { t } = useI18n();
  if (hiddenCount <= 0 || nextBatchSize <= 0) {
    return null;
  }

  return (
    <div className="px-1 py-1.5">
      <button
        type="button"
        className="control-sidebar-load-more"
        onClick={onShowMore}
        aria-label={t('Show {{count}} more projects', { count: nextBatchSize })}
        title={t('Show {{count}} more projects', { count: nextBatchSize })}
      >
        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 text-left">
          {t('Show {{count}} more', { count: nextBatchSize })}
        </span>
        <span className="shrink-0 text-muted-foreground">
          {t('{{count}} remaining', { count: hiddenCount })}
        </span>
      </button>
    </div>
  );
}
