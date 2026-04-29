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
});
