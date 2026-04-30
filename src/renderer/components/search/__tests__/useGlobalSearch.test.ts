/* @vitest-environment jsdom */

import type { ContentSearchResult } from '@shared/types';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type GlobalSearchState, useGlobalSearch } from '../useGlobalSearch';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

function createSearchResult(path: string): ContentSearchResult {
  return {
    matches: [
      {
        path,
        relativePath: path.replace('/repo/', ''),
        line: 1,
        column: 0,
        matchLength: 6,
        content: `match in ${path}`,
      },
    ],
    totalMatches: 1,
    totalFiles: 1,
    truncated: false,
  };
}

const searchApi = {
  files: vi.fn(),
  content: vi.fn(),
  cancel: vi.fn(),
};

let latestSearchState: ReturnType<typeof useGlobalSearch> | null = null;
let root: Root | null = null;
let container: HTMLDivElement | null = null;

function SearchHarness({ rootPath }: { rootPath: string }) {
  latestSearchState = useGlobalSearch(rootPath);
  return React.createElement('div');
}

function mountSearchHarness(rootPath = '/repo') {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(React.createElement(SearchHarness, { rootPath }));
  });
}

async function flushDebouncedSearch() {
  await act(async () => {
    vi.advanceTimersByTime(300);
  });
}

describe('useGlobalSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    searchApi.files.mockReset();
    searchApi.content.mockReset();
    searchApi.cancel.mockReset();
    searchApi.cancel.mockResolvedValue(false);
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        search: searchApi,
      },
    });
    latestSearchState = null;
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    root = null;
    container = null;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('ignores stale content search responses after a newer query completes', async () => {
    const firstSearch = createDeferred<ContentSearchResult>();
    const secondSearch = createDeferred<ContentSearchResult>();
    searchApi.content
      .mockReturnValueOnce(firstSearch.promise)
      .mockReturnValueOnce(secondSearch.promise);

    mountSearchHarness();

    act(() => {
      latestSearchState?.setQuery('first');
    });
    await flushDebouncedSearch();

    act(() => {
      latestSearchState?.setQuery('second');
    });
    await flushDebouncedSearch();

    expect(searchApi.content).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ requestId: 'global-search-1' })
    );
    expect(searchApi.cancel).toHaveBeenCalledWith({ requestId: 'global-search-1' });
    expect(searchApi.content).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ requestId: 'global-search-2' })
    );

    await act(async () => {
      secondSearch.resolve(createSearchResult('/repo/second.ts'));
      await secondSearch.promise;
    });

    expect(latestSearchState?.contentResults?.matches[0]?.path).toBe('/repo/second.ts');

    await act(async () => {
      firstSearch.resolve(createSearchResult('/repo/first.ts'));
      await firstSearch.promise;
    });

    expect(latestSearchState?.contentResults?.matches[0]?.path).toBe('/repo/second.ts');
    expect((latestSearchState as GlobalSearchState | null)?.isLoading).toBe(false);
  });

  it('cancels an active search when reset clears the dialog state', async () => {
    const activeSearch = createDeferred<ContentSearchResult>();
    searchApi.content.mockReturnValueOnce(activeSearch.promise);

    mountSearchHarness();

    act(() => {
      latestSearchState?.setQuery('needle');
    });
    await flushDebouncedSearch();

    expect(searchApi.content).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'global-search-1' })
    );

    act(() => {
      latestSearchState?.reset();
    });

    expect(searchApi.cancel).toHaveBeenCalledWith({ requestId: 'global-search-1' });
    expect((latestSearchState as GlobalSearchState | null)?.query).toBe('');
    expect((latestSearchState as GlobalSearchState | null)?.isLoading).toBe(false);
  });

  it('cancels an active search immediately when the user edits the query again', async () => {
    const firstSearch = createDeferred<ContentSearchResult>();
    const secondSearch = createDeferred<ContentSearchResult>();
    searchApi.content
      .mockReturnValueOnce(firstSearch.promise)
      .mockReturnValueOnce(secondSearch.promise);

    mountSearchHarness();

    act(() => {
      latestSearchState?.setQuery('needle');
    });
    await flushDebouncedSearch();

    expect(searchApi.content).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'global-search-1' })
    );

    act(() => {
      latestSearchState?.setQuery('needle plus');
    });

    expect(searchApi.cancel).toHaveBeenCalledWith({ requestId: 'global-search-1' });
    expect(searchApi.content).toHaveBeenCalledTimes(1);
    expect((latestSearchState as GlobalSearchState | null)?.isLoading).toBe(false);

    await flushDebouncedSearch();

    expect(searchApi.content).toHaveBeenCalledTimes(2);
    expect(searchApi.content).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ requestId: 'global-search-2' })
    );
  });

  it('clears results and cancels an active search immediately when the query is cleared', async () => {
    const completedSearch = createDeferred<ContentSearchResult>();
    const activeSearch = createDeferred<ContentSearchResult>();
    searchApi.content
      .mockReturnValueOnce(completedSearch.promise)
      .mockReturnValueOnce(activeSearch.promise);

    mountSearchHarness();

    act(() => {
      latestSearchState?.setQuery('first');
    });
    await flushDebouncedSearch();

    await act(async () => {
      completedSearch.resolve(createSearchResult('/repo/first.ts'));
      await completedSearch.promise;
    });

    expect(latestSearchState?.contentResults?.matches[0]?.path).toBe('/repo/first.ts');

    act(() => {
      latestSearchState?.setQuery('second');
    });
    await flushDebouncedSearch();

    expect(searchApi.content).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ requestId: 'global-search-2' })
    );

    act(() => {
      latestSearchState?.setQuery('');
    });

    expect(searchApi.cancel).toHaveBeenCalledWith({ requestId: 'global-search-2' });
    expect((latestSearchState as GlobalSearchState | null)?.query).toBe('');
    expect((latestSearchState as GlobalSearchState | null)?.contentResults).toBeNull();
    expect((latestSearchState as GlobalSearchState | null)?.fileResults).toEqual([]);
    expect((latestSearchState as GlobalSearchState | null)?.isLoading).toBe(false);
  });
});
