import type { FileSearchResult } from '@shared/types';
import { FileText, Folder } from 'lucide-react';
import {
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import {
  findTodoContextMention,
  getTodoContextMentionReplacementPath,
  isTodoContextMentionDirectory,
  replaceTodoContextMention,
} from './todoContextMentions';

type MentionInputElement = HTMLInputElement | HTMLTextAreaElement;

interface UseTodoContextMentionAutocompleteOptions<T extends MentionInputElement> {
  rootPath: string | undefined;
  value: string;
  inputRef: RefObject<T | null>;
  onValueChange: (value: string) => void;
  onMentionSelected?: (item: FileSearchResult) => void;
}

interface TodoContextMentionPopupPosition {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  placement: 'above' | 'below';
}

export interface TodoContextMentionAutocompleteState<T extends MentionInputElement> {
  activeIndex: number;
  hasSearched: boolean;
  inputRef: RefObject<T | null>;
  isOpen: boolean;
  isSearching: boolean;
  results: FileSearchResult[];
  close: () => void;
  handleKeyDown: (event: KeyboardEvent<T>) => boolean;
  insertMention: (item: FileSearchResult) => void;
  updateMentionQuery: (nextValue: string) => void;
}

function getResultParts(relativePath: string): { dirPart: string; fileName: string } {
  const lastSep = relativePath.lastIndexOf('/');
  if (lastSep <= 0) {
    return { dirPart: '', fileName: relativePath };
  }

  return {
    dirPart: relativePath.slice(0, lastSep),
    fileName: relativePath.slice(lastSep + 1),
  };
}

function resolvePopupPosition(anchor: HTMLElement): TodoContextMentionPopupPosition {
  const rect = anchor.getBoundingClientRect();
  const margin = 8;
  const gap = 4;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.min(Math.max(rect.width, 280), Math.max(160, viewportWidth - margin * 2));
  const left = Math.max(margin, Math.min(rect.left, viewportWidth - width - margin));
  const spaceBelow = viewportHeight - rect.bottom - margin;
  const spaceAbove = rect.top - margin;
  const placement = spaceBelow < 180 && spaceAbove > spaceBelow ? 'above' : 'below';
  const availableHeight = Math.max(96, placement === 'above' ? spaceAbove : spaceBelow);

  return {
    left,
    top: placement === 'above' ? rect.top - gap : rect.bottom + gap,
    width,
    maxHeight: Math.min(260, availableHeight - gap),
    placement,
  };
}

function usePopupPosition(
  anchorRef: RefObject<HTMLElement | null>,
  open: boolean
): TodoContextMentionPopupPosition | null {
  const [position, setPosition] = useState<TodoContextMentionPopupPosition | null>(null);

  useLayoutEffect(() => {
    if (!open || typeof window === 'undefined') {
      setPosition(null);
      return;
    }

    const anchor = anchorRef.current;
    if (!anchor) {
      setPosition(null);
      return;
    }

    const update = () => setPosition(resolvePopupPosition(anchor));
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);

    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchorRef, open]);

  return position;
}

export function useTodoContextMentionAutocomplete<T extends MentionInputElement>({
  inputRef,
  onMentionSelected,
  onValueChange,
  rootPath,
  value,
}: UseTodoContextMentionAutocompleteOptions<T>): TodoContextMentionAutocompleteState<T> {
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [results, setResults] = useState<FileSearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const searchRootPath = rootPath?.trim();
  const isOpen = mentionQuery !== null && Boolean(searchRootPath);

  const close = useCallback(() => {
    setMentionQuery(null);
    setResults([]);
    setActiveIndex(0);
    setIsSearching(false);
    setHasSearched(false);
  }, []);

  const updateMentionQuery = useCallback(
    (nextValue: string) => {
      if (!searchRootPath) {
        close();
        return;
      }

      window.setTimeout(() => {
        const cursor = inputRef.current?.selectionStart;
        if (cursor === undefined || cursor === null) {
          close();
          return;
        }

        const mention = findTodoContextMention(nextValue, cursor);
        setMentionQuery(mention?.query ?? null);
        setActiveIndex(0);
        setHasSearched(false);
      }, 0);
    },
    [close, inputRef, searchRootPath]
  );

  useEffect(() => {
    if (mentionQuery === null || !searchRootPath) {
      setResults([]);
      setIsSearching(false);
      setHasSearched(false);
      return;
    }

    let alive = true;
    setIsSearching(true);
    setHasSearched(false);

    const timer = window.setTimeout(() => {
      window.electronAPI.search
        .files({
          rootPath: searchRootPath,
          query: mentionQuery,
          maxResults: 10,
          includeDirectories: true,
        })
        .then((nextResults) => {
          if (!alive) return;
          setResults(nextResults);
          setActiveIndex(0);
          setIsSearching(false);
          setHasSearched(true);
        })
        .catch(() => {
          if (!alive) return;
          setResults([]);
          setActiveIndex(0);
          setIsSearching(false);
          setHasSearched(true);
        });
    }, 150);

    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [mentionQuery, searchRootPath]);

  const insertMention = useCallback(
    (item: FileSearchResult) => {
      const input = inputRef.current;
      if (!input) {
        return;
      }

      const cursor = input.selectionStart ?? value.length;
      const replacement = replaceTodoContextMention(
        value,
        cursor,
        getTodoContextMentionReplacementPath(item)
      );
      if (!replacement) {
        return;
      }

      onValueChange(replacement.nextText);
      onMentionSelected?.(item);
      close();
      window.setTimeout(() => {
        input.focus();
        input.setSelectionRange(replacement.nextCursor, replacement.nextCursor);
      }, 0);
    },
    [close, inputRef, onMentionSelected, onValueChange, value]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<T>): boolean => {
      if (!isOpen) {
        return false;
      }

      if (results.length > 0) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setActiveIndex((index) => (index + 1) % results.length);
          return true;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setActiveIndex((index) => (index - 1 + results.length) % results.length);
          return true;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          event.preventDefault();
          insertMention(results[activeIndex]);
          return true;
        }
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return true;
      }

      return false;
    },
    [activeIndex, close, insertMention, isOpen, results]
  );

  return {
    activeIndex,
    close,
    handleKeyDown,
    hasSearched,
    inputRef,
    insertMention,
    isOpen,
    isSearching,
    results,
    updateMentionQuery,
  };
}

interface TodoContextMentionPopupProps {
  activeIndex: number;
  anchorRef: RefObject<HTMLElement | null>;
  emptyLabel: string;
  hasSearched: boolean;
  isOpen: boolean;
  isSearching: boolean;
  loadingLabel: string;
  results: readonly FileSearchResult[];
  onSelect: (item: FileSearchResult) => void;
}

export function TodoContextMentionPopup({
  activeIndex,
  anchorRef,
  emptyLabel,
  hasSearched,
  isOpen,
  isSearching,
  loadingLabel,
  onSelect,
  results,
}: TodoContextMentionPopupProps) {
  const [listElement, setListElement] = useState<HTMLDivElement | null>(null);
  const position = usePopupPosition(anchorRef, isOpen);

  useEffect(() => {
    if (!isOpen || results.length === 0) {
      return;
    }

    const item = listElement?.children[activeIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, isOpen, listElement, results.length]);

  if (!isOpen || !position || typeof document === 'undefined' || typeof window === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className="control-floating fixed z-[9999] overflow-hidden rounded-lg"
      style={{
        left: position.left,
        top: position.top,
        transform: position.placement === 'above' ? 'translateY(-100%)' : undefined,
        width: position.width,
      }}
    >
      <div
        ref={setListElement}
        className="overflow-y-auto py-1"
        style={{ maxHeight: position.maxHeight }}
      >
        {results.length > 0 ? (
          results.map((item, index) => {
            const { dirPart, fileName } = getResultParts(item.relativePath);
            const isDirectory = isTodoContextMentionDirectory(item);
            return (
              <button
                type="button"
                key={item.path}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onSelect(item);
                }}
                className={cn(
                  'flex w-full min-w-0 items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors',
                  index === activeIndex
                    ? 'bg-accent text-accent-foreground'
                    : 'text-foreground hover:bg-accent/50'
                )}
              >
                {isDirectory ? (
                  <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate">{fileName}</span>
                {dirPart && (
                  <span className="max-w-[55%] shrink-0 truncate text-xs text-muted-foreground">
                    {dirPart}
                  </span>
                )}
              </button>
            );
          })
        ) : (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            {isSearching || !hasSearched ? loadingLabel : emptyLabel}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
