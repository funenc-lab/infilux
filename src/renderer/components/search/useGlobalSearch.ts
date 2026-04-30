import type { ContentSearchMatch, ContentSearchResult, FileSearchResult } from '@shared/types';
import { useCallback, useEffect, useRef, useState } from 'react';

export type SearchMode = 'files' | 'content';

export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  filePattern: string;
  useGitignore: boolean;
}

export interface GlobalSearchState {
  mode: SearchMode;
  query: string;
  options: SearchOptions;
  fileResults: FileSearchResult[];
  contentResults: ContentSearchResult | null;
  selectedIndex: number;
  isLoading: boolean;
  error: string | null;
}

const DEFAULT_OPTIONS: SearchOptions = {
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  filePattern: '',
  useGitignore: true,
};

export function useGlobalSearch(rootPath: string | undefined) {
  const [state, setState] = useState<GlobalSearchState>({
    mode: 'content',
    query: '',
    options: DEFAULT_OPTIONS,
    fileResults: [],
    contentResults: null,
    selectedIndex: 0,
    isLoading: false,
    error: null,
  });

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const requestGenerationRef = useRef(0);
  const activeRequestIdRef = useRef<string | null>(null);

  // Keep refs to latest state values for use in debounced callbacks
  const stateRef = useRef(state);
  stateRef.current = state;

  const cancelActiveSearch = useCallback(() => {
    const requestId = activeRequestIdRef.current;
    if (!requestId) {
      return;
    }
    activeRequestIdRef.current = null;
    void window.electronAPI.search.cancel({ requestId }).catch(() => undefined);
  }, []);

  const search = useCallback(
    async (query: string, mode: SearchMode, options: SearchOptions) => {
      if (!rootPath || !query.trim()) {
        requestGenerationRef.current += 1;
        cancelActiveSearch();
        setState((prev) => ({
          ...prev,
          fileResults: [],
          contentResults: null,
          selectedIndex: 0,
          isLoading: false,
          error: null,
        }));
        return;
      }

      cancelActiveSearch();
      const requestGeneration = requestGenerationRef.current + 1;
      requestGenerationRef.current = requestGeneration;
      const requestId = `global-search-${requestGeneration}`;
      activeRequestIdRef.current = requestId;

      const isCurrentRequest = () =>
        requestGenerationRef.current === requestGeneration &&
        activeRequestIdRef.current === requestId;

      const clearActiveRequest = () => {
        if (activeRequestIdRef.current === requestId) {
          activeRequestIdRef.current = null;
        }
      };

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        if (mode === 'files') {
          const results = await window.electronAPI.search.files({
            rootPath,
            query,
            maxResults: 100,
            useGitignore: options.useGitignore,
            requestId,
          });
          if (!isCurrentRequest()) {
            return;
          }
          clearActiveRequest();
          setState((prev) => ({
            ...prev,
            fileResults: results,
            contentResults: null,
            selectedIndex: 0,
            isLoading: false,
            error: null,
          }));
        } else {
          const results = await window.electronAPI.search.content({
            rootPath,
            query,
            maxResults: 500,
            caseSensitive: options.caseSensitive,
            wholeWord: options.wholeWord,
            regex: options.regex,
            filePattern: options.filePattern || undefined,
            useGitignore: options.useGitignore,
            requestId,
          });
          if (!isCurrentRequest()) {
            return;
          }
          clearActiveRequest();
          setState((prev) => ({
            ...prev,
            fileResults: [],
            contentResults: results,
            selectedIndex: 0,
            isLoading: false,
            error: results.error ?? null,
          }));
        }
      } catch {
        if (!isCurrentRequest()) {
          return;
        }
        clearActiveRequest();
        setState((prev) => ({ ...prev, isLoading: false, error: 'Search failed' }));
      }
    },
    [cancelActiveSearch, rootPath]
  );

  const setQuery = useCallback(
    (query: string) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      const hasActiveSearch = activeRequestIdRef.current !== null;

      if (!query.trim()) {
        cancelActiveSearch();
        setState((prev) => ({
          ...prev,
          query,
          fileResults: [],
          contentResults: null,
          selectedIndex: 0,
          isLoading: false,
          error: null,
        }));
        return;
      }

      if (hasActiveSearch) {
        cancelActiveSearch();
      }

      setState((prev) => ({
        ...prev,
        query,
        selectedIndex: 0,
        isLoading: hasActiveSearch ? false : prev.isLoading,
        error: hasActiveSearch ? null : prev.error,
      }));

      // Debounce search using stateRef to get latest mode/options
      debounceTimerRef.current = setTimeout(() => {
        const { mode, options } = stateRef.current;
        search(query, mode, options);
      }, 300);
    },
    [cancelActiveSearch, search]
  );

  const setMode = useCallback(
    (mode: SearchMode) => {
      setState((prev) => ({ ...prev, mode, selectedIndex: 0 }));
      // Use stateRef to get latest query and options
      const { query, options } = stateRef.current;
      if (query.trim()) {
        search(query, mode, options);
      }
    },
    [search]
  );

  const setOptions = useCallback(
    (optionUpdates: Partial<SearchOptions>) => {
      const { query, mode, options } = stateRef.current;
      const newOptions = { ...options, ...optionUpdates };
      setState((prev) => ({ ...prev, options: newOptions }));
      // Trigger search with new options
      if (query.trim()) {
        search(query, mode, newOptions);
      }
    },
    [search]
  );

  const setSelectedIndex = useCallback((index: number) => {
    setState((prev) => ({ ...prev, selectedIndex: index }));
  }, []);

  const moveSelection = useCallback((delta: number) => {
    setState((prev) => {
      const maxIndex =
        prev.mode === 'files'
          ? prev.fileResults.length - 1
          : (prev.contentResults?.matches.length ?? 0) - 1;
      const newIndex = Math.max(0, Math.min(maxIndex, prev.selectedIndex + delta));
      return { ...prev, selectedIndex: newIndex };
    });
  }, []);

  const getSelectedItem = useCallback((): FileSearchResult | ContentSearchMatch | null => {
    if (state.mode === 'files') {
      return state.fileResults[state.selectedIndex] ?? null;
    }
    return state.contentResults?.matches[state.selectedIndex] ?? null;
  }, [state.mode, state.fileResults, state.contentResults, state.selectedIndex]);

  const reset = useCallback(() => {
    requestGenerationRef.current += 1;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    cancelActiveSearch();
    setState({
      mode: 'content',
      query: '',
      options: DEFAULT_OPTIONS,
      fileResults: [],
      contentResults: null,
      selectedIndex: 0,
      isLoading: false,
      error: null,
    });
  }, [cancelActiveSearch]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      requestGenerationRef.current += 1;
      cancelActiveSearch();
    };
  }, [cancelActiveSearch]);

  return {
    ...state,
    setQuery,
    setMode,
    setOptions,
    setSelectedIndex,
    moveSelection,
    getSelectedItem,
    reset,
  };
}
