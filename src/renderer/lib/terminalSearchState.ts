import type { XtermTheme } from './ghosttyTheme';

export interface TerminalSearchState {
  resultIndex: number;
  resultCount: number;
  hasSearched: boolean;
}

export interface TerminalSearchResultChange {
  resultIndex: number;
  resultCount: number;
}

interface TerminalSearchDecorations {
  matchBackground?: string;
  matchBorder?: string;
  matchOverviewRuler: string;
  activeMatchBackground?: string;
  activeMatchBorder?: string;
  activeMatchColorOverviewRuler: string;
}

export function createEmptyTerminalSearchState(): TerminalSearchState {
  return {
    resultIndex: 0,
    resultCount: 0,
    hasSearched: false,
  };
}

export function createTerminalSearchState(
  resultChange: TerminalSearchResultChange
): TerminalSearchState {
  return {
    resultIndex: resultChange.resultIndex,
    resultCount: Math.max(0, resultChange.resultCount),
    hasSearched: true,
  };
}

export function getTerminalSearchStatusLabel(
  searchTerm: string,
  searchState: TerminalSearchState
): string | null {
  if (!searchTerm.trim() || !searchState.hasSearched) {
    return null;
  }

  if (searchState.resultCount <= 0) {
    return '0';
  }

  const activeResult =
    searchState.resultIndex >= 0
      ? Math.min(searchState.resultIndex + 1, searchState.resultCount)
      : searchState.resultCount;

  return `${activeResult}/${searchState.resultCount}`;
}

export function buildTerminalSearchDecorations(
  theme: Pick<XtermTheme, 'selectionBackground' | 'blue' | 'brightBlue' | 'yellow' | 'brightYellow'>
): TerminalSearchDecorations {
  return {
    matchBackground: theme.selectionBackground,
    matchBorder: theme.blue,
    matchOverviewRuler: theme.blue,
    activeMatchBackground: theme.yellow,
    activeMatchBorder: theme.brightYellow,
    activeMatchColorOverviewRuler: theme.brightYellow,
  };
}
