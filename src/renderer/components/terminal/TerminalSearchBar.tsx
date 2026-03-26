import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface SearchOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
}

interface TerminalSearchBarProps {
  isOpen: boolean;
  onClose: () => void;
  onFindNext: (term: string, options?: SearchOptions) => boolean;
  onFindPrevious: (term: string, options?: SearchOptions) => boolean;
  onClearSearch: () => void;
  theme?: {
    background?: string;
    foreground?: string;
  };
}

export interface TerminalSearchBarRef {
  focus: () => void;
}

export const TerminalSearchBar = forwardRef<TerminalSearchBarRef, TerminalSearchBarProps>(
  function TerminalSearchBar(
    { isOpen, onClose, onFindNext, onFindPrevious, onClearSearch, theme },
    ref
  ) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [wholeWord, setWholeWord] = useState(false);
    const [regex, setRegex] = useState(false);
    const [hasResults, setHasResults] = useState<boolean | null>(null);

    // Expose focus method to parent
    useImperativeHandle(ref, () => ({
      focus: () => {
        inputRef.current?.focus();
        inputRef.current?.select();
      },
    }));

    // Focus input when opened
    useEffect(() => {
      if (isOpen) {
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }, [isOpen]);

    // Clear search when closed
    useEffect(() => {
      if (!isOpen) {
        onClearSearch();
        setHasResults(null);
      }
    }, [isOpen, onClearSearch]);

    const handleSearch = useCallback(
      (direction: 'next' | 'prev') => {
        if (!searchTerm) {
          setHasResults(null);
          return;
        }
        const options = { caseSensitive, wholeWord, regex };
        const found =
          direction === 'next'
            ? onFindNext(searchTerm, options)
            : onFindPrevious(searchTerm, options);
        setHasResults(found);
      },
      [searchTerm, caseSensitive, wholeWord, regex, onFindNext, onFindPrevious]
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleSearch(e.shiftKey ? 'prev' : 'next');
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      },
      [handleSearch, onClose]
    );

    const handleInputChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setSearchTerm(value);
        if (value) {
          const found = onFindNext(value, { caseSensitive, wholeWord, regex });
          setHasResults(found);
        } else {
          onClearSearch();
          setHasResults(null);
        }
      },
      [caseSensitive, wholeWord, regex, onFindNext, onClearSearch]
    );

    if (!isOpen) return null;

    const bgColor = theme?.background ?? 'var(--popover)';
    const fgColor = theme?.foreground ?? 'var(--foreground)';
    const borderColor = `color-mix(in oklab, ${fgColor} 22%, transparent)`;
    const activeToggleBackground = `color-mix(in oklab, ${fgColor} 16%, transparent)`;
    const activeToggleColor = `color-mix(in oklab, ${fgColor} 92%, var(--foreground) 8%)`;

    return (
      <div
        className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-md border px-2 py-1 shadow-lg"
        style={{
          backgroundColor: bgColor,
          borderColor,
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Search..."
          className="w-40 bg-transparent text-sm outline-none placeholder:opacity-50"
          style={{
            color: hasResults === false && searchTerm ? 'var(--destructive)' : fgColor,
          }}
        />

        {/* Case sensitive toggle */}
        <button
          type="button"
          onClick={() => setCaseSensitive(!caseSensitive)}
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded text-xs font-bold transition-colors',
            caseSensitive ? '' : 'opacity-50 hover:opacity-100'
          )}
          style={{
            color: caseSensitive ? activeToggleColor : fgColor,
            backgroundColor: caseSensitive ? activeToggleBackground : 'transparent',
          }}
          title="Case Sensitive (Aa)"
        >
          Aa
        </button>

        {/* Whole word toggle */}
        <button
          type="button"
          onClick={() => setWholeWord(!wholeWord)}
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded text-xs font-bold transition-colors',
            wholeWord ? '' : 'opacity-50 hover:opacity-100'
          )}
          style={{
            color: wholeWord ? activeToggleColor : fgColor,
            backgroundColor: wholeWord ? activeToggleBackground : 'transparent',
          }}
          title="Whole Word"
        >
          W
        </button>

        {/* Regex toggle */}
        <button
          type="button"
          onClick={() => setRegex(!regex)}
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded text-xs font-bold transition-colors',
            regex ? '' : 'opacity-50 hover:opacity-100'
          )}
          style={{
            color: regex ? activeToggleColor : fgColor,
            backgroundColor: regex ? activeToggleBackground : 'transparent',
          }}
          title="Regular Expression"
        >
          .*
        </button>

        <div className="mx-1 h-4 w-px" style={{ backgroundColor: borderColor }} />

        {/* Previous */}
        <button
          type="button"
          onClick={() => handleSearch('prev')}
          className="flex h-6 w-6 items-center justify-center rounded opacity-70 hover:opacity-100 transition-opacity"
          style={{ color: fgColor }}
          title="Previous (Shift+Enter)"
        >
          <ChevronUp className="h-4 w-4" />
        </button>

        {/* Next */}
        <button
          type="button"
          onClick={() => handleSearch('next')}
          className="flex h-6 w-6 items-center justify-center rounded opacity-70 hover:opacity-100 transition-opacity"
          style={{ color: fgColor }}
          title="Next (Enter)"
        >
          <ChevronDown className="h-4 w-4" />
        </button>

        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded opacity-70 hover:opacity-100 transition-opacity"
          style={{ color: fgColor }}
          title="Close (Esc)"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }
);
