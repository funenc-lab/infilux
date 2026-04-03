import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { getTerminalSearchStatusLabel, type TerminalSearchState } from '@/lib/terminalSearchState';
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
  searchState: TerminalSearchState;
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
    { isOpen, onClose, onFindNext, onFindPrevious, onClearSearch, searchState, theme },
    ref
  ) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [wholeWord, setWholeWord] = useState(false);
    const [regex, setRegex] = useState(false);

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
      }
    }, [isOpen, onClearSearch]);

    const handleSearch = useCallback(
      (direction: 'next' | 'prev') => {
        if (!searchTerm) {
          return;
        }
        const options = { caseSensitive, wholeWord, regex };
        if (direction === 'next') {
          onFindNext(searchTerm, options);
          return;
        }
        onFindPrevious(searchTerm, options);
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
          onFindNext(value, { caseSensitive, wholeWord, regex });
        } else {
          onClearSearch();
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
    const searchStatusLabel = getTerminalSearchStatusLabel(searchTerm, searchState);
    const hasNoResults = Boolean(searchTerm.trim()) && searchStatusLabel === '0';

    return (
      <div
        className="control-floating absolute right-2 top-2 z-10 flex items-center gap-1 rounded-lg px-2 py-1"
        style={{
          backgroundColor: bgColor,
          borderColor,
        }}
      >
        <input
          aria-label="Search terminal output"
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Search..."
          className="w-40 bg-transparent text-sm outline-none placeholder:opacity-50"
          style={{
            color: hasNoResults ? 'var(--destructive)' : fgColor,
          }}
        />
        {searchStatusLabel && (
          <span
            className="min-w-8 text-right text-[11px] tabular-nums opacity-70"
            style={{ color: hasNoResults ? 'var(--destructive)' : fgColor }}
          >
            {searchStatusLabel}
          </span>
        )}

        {/* Case sensitive toggle */}
        <button
          aria-label="Toggle case sensitive search"
          aria-pressed={caseSensitive}
          type="button"
          onClick={() => setCaseSensitive(!caseSensitive)}
          className={cn(
            'relative flex h-6 w-6 items-center justify-center rounded text-xs font-bold transition-colors pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11',
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
          aria-label="Toggle whole word search"
          aria-pressed={wholeWord}
          type="button"
          onClick={() => setWholeWord(!wholeWord)}
          className={cn(
            'relative flex h-6 w-6 items-center justify-center rounded text-xs font-bold transition-colors pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11',
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
          aria-label="Toggle regular expression search"
          aria-pressed={regex}
          type="button"
          onClick={() => setRegex(!regex)}
          className={cn(
            'relative flex h-6 w-6 items-center justify-center rounded text-xs font-bold transition-colors pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11',
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
          aria-label="Find previous match"
          type="button"
          onClick={() => handleSearch('prev')}
          className="relative flex h-6 w-6 items-center justify-center rounded opacity-70 transition-opacity hover:opacity-100 pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11"
          style={{ color: fgColor }}
          title="Previous (Shift+Enter)"
        >
          <ChevronUp className="h-4 w-4" />
        </button>

        {/* Next */}
        <button
          aria-label="Find next match"
          type="button"
          onClick={() => handleSearch('next')}
          className="relative flex h-6 w-6 items-center justify-center rounded opacity-70 transition-opacity hover:opacity-100 pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11"
          style={{ color: fgColor }}
          title="Next (Enter)"
        >
          <ChevronDown className="h-4 w-4" />
        </button>

        {/* Close */}
        <button
          aria-label="Close search"
          type="button"
          onClick={onClose}
          className="relative flex h-6 w-6 items-center justify-center rounded opacity-70 transition-opacity hover:opacity-100 pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11"
          style={{ color: fgColor }}
          title="Close (Esc)"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }
);
