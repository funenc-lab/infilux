import { ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const lastScrollTopRef = useRef(0);
  const lastTriggeredScrollTopRef = useRef<number | null>(null);
  const pendingScrollRef = useRef<{
    container: HTMLElement;
    scrollTop: number;
    hiddenCount: number;
    anchor: { element: HTMLElement; offset: number } | null;
  } | null>(null);

  const handleShowMore = useCallback(() => {
    if (scrollContainer) {
      const viewportBounds = scrollContainer.getBoundingClientRect();
      const visibleRows = Array.from(
        scrollContainer.querySelectorAll<HTMLElement>('.control-tree-node')
      )
        .map((element) => ({ element, bounds: element.getBoundingClientRect() }))
        .filter(
          ({ bounds }) => bounds.bottom > viewportBounds.top && bounds.top < viewportBounds.bottom
        );
      const anchor =
        visibleRows.find(({ element }) => element.dataset.active === 'worktree') ??
        visibleRows.find(({ element }) => element.dataset.active === 'repo') ??
        visibleRows[0];
      pendingScrollRef.current = {
        container: scrollContainer,
        scrollTop: scrollContainer.scrollTop,
        hiddenCount,
        anchor: anchor
          ? { element: anchor.element, offset: anchor.bounds.top - viewportBounds.top }
          : null,
      };
      lastTriggeredScrollTopRef.current = scrollContainer.scrollTop;
    }
    onShowMore();
  }, [hiddenCount, onShowMore, scrollContainer]);

  useLayoutEffect(() => {
    const pendingScroll = pendingScrollRef.current;
    if (pendingScroll?.container === scrollContainer && pendingScroll.hiddenCount !== hiddenCount) {
      const anchor = pendingScroll.anchor;
      if (anchor && scrollContainer.contains(anchor.element)) {
        const offset =
          anchor.element.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top;
        scrollContainer.scrollTop += offset - anchor.offset;
      } else {
        scrollContainer.scrollTop = pendingScroll.scrollTop;
      }
      lastScrollTopRef.current = scrollContainer.scrollTop;
      lastTriggeredScrollTopRef.current = scrollContainer.scrollTop;
    }
    pendingScrollRef.current = null;
  }, [hiddenCount, scrollContainer]);

  useEffect(() => {
    if (!scrollContainer || hiddenCount <= 0 || nextBatchSize <= 0) {
      return;
    }

    const isLoadingControlVisible = () => {
      const buttonBounds = buttonRef.current?.getBoundingClientRect();
      const viewportBounds = scrollContainer.getBoundingClientRect();
      return (
        buttonBounds !== undefined &&
        scrollContainer.clientHeight > 0 &&
        buttonBounds.top <= viewportBounds.bottom + 32 &&
        buttonBounds.bottom >= viewportBounds.top
      );
    };

    const handleScroll = () => {
      const scrollTop = scrollContainer.scrollTop;
      const isScrollingDown = scrollTop > lastScrollTopRef.current;
      const canLoadAtCurrentPosition =
        isScrollingDown &&
        isLoadingControlVisible() &&
        lastTriggeredScrollTopRef.current !== scrollTop;

      if (canLoadAtCurrentPosition) {
        handleShowMore();
      }

      lastScrollTopRef.current = scrollTop;
    };

    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY <= 0 || event.ctrlKey || event.shiftKey) {
        return;
      }
      const distanceToBottom =
        scrollContainer.scrollHeight - scrollContainer.clientHeight - scrollContainer.scrollTop;
      if (distanceToBottom <= 1 && isLoadingControlVisible()) {
        handleShowMore();
      }
    };

    lastScrollTopRef.current = scrollContainer.scrollTop;
    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    scrollContainer.addEventListener('wheel', handleWheel, { passive: true });
    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
      scrollContainer.removeEventListener('wheel', handleWheel);
    };
  }, [hiddenCount, nextBatchSize, handleShowMore, scrollContainer]);

  if (hiddenCount <= 0 || nextBatchSize <= 0) {
    return null;
  }

  return (
    <div className="px-1 py-1.5">
      <button
        ref={buttonRef}
        type="button"
        className="control-sidebar-load-more justify-center"
        onClick={handleShowMore}
        aria-label={t('Load more projects')}
      >
        <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      </button>
    </div>
  );
}
