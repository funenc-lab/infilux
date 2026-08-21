import { ChevronDown } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useI18n } from '@/i18n';

interface RepositoryLoadMoreButtonProps {
  hiddenCount: number;
  nextBatchSize: number;
  onShowMore: () => void;
  scrollContainer?: HTMLElement | null;
}

export function RepositoryLoadMoreButton({
  hiddenCount,
  nextBatchSize,
  onShowMore,
  scrollContainer = null,
}: RepositoryLoadMoreButtonProps) {
  const { t } = useI18n();
  const lastScrollTopRef = useRef(0);
  const lastTriggeredScrollTopRef = useRef<number | null>(null);

  useEffect(() => {
    if (!scrollContainer || hiddenCount <= 0 || nextBatchSize <= 0) {
      return;
    }

    const handleScroll = () => {
      const scrollTop = scrollContainer.scrollTop;
      const distanceToBottom =
        scrollContainer.scrollHeight - scrollContainer.clientHeight - scrollTop;
      const isScrollingDown = scrollTop > lastScrollTopRef.current;
      const canLoadAtCurrentPosition =
        isScrollingDown &&
        distanceToBottom <= 32 &&
        lastTriggeredScrollTopRef.current !== scrollTop;

      if (canLoadAtCurrentPosition) {
        lastTriggeredScrollTopRef.current = scrollTop;
        onShowMore();
      }

      lastScrollTopRef.current = scrollTop;
    };

    lastScrollTopRef.current = scrollContainer.scrollTop;
    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
    };
  }, [hiddenCount, nextBatchSize, onShowMore, scrollContainer]);

  if (hiddenCount <= 0 || nextBatchSize <= 0) {
    return null;
  }

  return (
    <div className="px-1 py-1.5">
      <button
        type="button"
        className="control-sidebar-load-more"
        onClick={onShowMore}
        aria-label={t('Load more projects')}
        title={t('Load more projects')}
      >
        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 text-left">{t('Load more')}</span>
        <span className="shrink-0 text-muted-foreground">
          {t('{{count}} remaining', { count: hiddenCount })}
        </span>
      </button>
    </div>
  );
}
