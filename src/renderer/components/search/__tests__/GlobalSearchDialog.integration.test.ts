/* @vitest-environment jsdom */

import type { ContentSearchResult, FileSearchResult } from '@shared/types';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobalSearchDialog } from '../GlobalSearchDialog';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

type DialogRootProps = {
  open?: boolean;
  children?: React.ReactNode;
};

type DivProps = React.HTMLAttributes<HTMLDivElement> & {
  children?: React.ReactNode;
};

type TParams = Record<string, string | number> | undefined;

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

function createContentResult(path: string, content: string): ContentSearchResult {
  return {
    matches: [
      {
        path,
        relativePath: path.replace('/repo/', ''),
        line: 7,
        column: 2,
        matchLength: 6,
        content,
      },
    ],
    totalMatches: 1,
    totalFiles: 1,
    truncated: false,
  };
}

function createFileResult(path: string): FileSearchResult {
  const relativePath = path.replace('/repo/', '');
  const name = relativePath.split('/').pop() ?? relativePath;
  return {
    path,
    name,
    relativePath,
    score: 100,
  };
}

function translate(key: string, params?: TParams): string {
  if (!params) {
    return key;
  }
  return key.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(params[name] ?? ''));
}

vi.mock('@base-ui/react/dialog', () => ({
  Dialog: {
    Popup: ({ children, ...props }: DivProps) => React.createElement('div', props, children),
  },
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: DialogRootProps) =>
    open ? React.createElement(React.Fragment, null, children) : null,
  DialogBackdrop: (props: DivProps) => React.createElement('div', props),
  DialogPortal: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  DialogViewport: ({ children, ...props }: DivProps) => React.createElement('div', props, children),
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children, ...props }: DivProps) => React.createElement('div', props, children),
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({ t: translate }),
}));

vi.mock('@/stores/settings', () => ({
  useSettingsStore: (selector: (state: { editorSettings: { fontFamily: string } }) => unknown) =>
    selector({ editorSettings: { fontFamily: 'Menlo' } }),
}));

vi.mock('../SearchPreviewPanel', () => ({
  SearchPreviewPanel: ({
    path,
    line,
    query,
  }: {
    path: string | null;
    line?: number;
    query: string;
  }) => React.createElement('div', { 'data-testid': 'search-preview' }, `${path}:${line}:${query}`),
}));

const searchApi = {
  files: vi.fn(),
  content: vi.fn(),
  cancel: vi.fn(),
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let onOpenChange: ReturnType<typeof vi.fn>;
let onOpenFile: ReturnType<typeof vi.fn>;

function renderDialog(initialMode: 'files' | 'content' = 'content') {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      React.createElement(GlobalSearchDialog, {
        open: true,
        onOpenChange,
        rootPath: '/repo',
        initialMode,
        onOpenFile,
      })
    );
  });

  return container;
}

function getSearchInput(view: HTMLElement, placeholder: string): HTMLInputElement {
  const input = view.querySelector(`input[placeholder="${placeholder}"]`);
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Search input with placeholder "${placeholder}" was not rendered`);
  }
  return input;
}

function updateInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )?.set;
  if (!valueSetter) {
    throw new Error('HTMLInputElement value setter is unavailable');
  }
  valueSetter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function flushDebouncedSearch() {
  await act(async () => {
    vi.advanceTimersByTime(300);
  });
}

describe('GlobalSearchDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    searchApi.files.mockReset();
    searchApi.content.mockReset();
    searchApi.cancel.mockReset();
    searchApi.cancel.mockResolvedValue(false);
    onOpenChange = vi.fn();
    onOpenFile = vi.fn();
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        search: searchApi,
      },
    });
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

  it('keeps content results tied to the latest query after an older search is cancelled', async () => {
    const firstSearch = createDeferred<ContentSearchResult>();
    const secondSearch = createDeferred<ContentSearchResult>();
    searchApi.content
      .mockReturnValueOnce(firstSearch.promise)
      .mockReturnValueOnce(secondSearch.promise);

    const view = renderDialog('content');
    const input = getSearchInput(view, 'Search in files...');

    act(() => {
      updateInputValue(input, 'first');
    });
    await flushDebouncedSearch();

    expect(searchApi.content).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ query: 'first', requestId: 'global-search-1' })
    );

    act(() => {
      updateInputValue(input, 'second');
    });

    expect(searchApi.cancel).toHaveBeenCalledWith({ requestId: 'global-search-1' });
    expect(searchApi.content).toHaveBeenCalledTimes(1);

    await flushDebouncedSearch();

    expect(searchApi.content).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ query: 'second', requestId: 'global-search-2' })
    );

    await act(async () => {
      secondSearch.resolve(createContentResult('/repo/src/second.ts', 'second match content'));
      await secondSearch.promise;
    });

    expect(view.textContent).toContain('second match content');
    expect(view.textContent).toContain('second.ts');

    await act(async () => {
      firstSearch.resolve(createContentResult('/repo/src/first.ts', 'first stale content'));
      await firstSearch.promise;
    });

    expect(view.textContent).toContain('second match content');
    expect(view.textContent).not.toContain('first stale content');
  });

  it('renders file search results with filename and parent path context', async () => {
    searchApi.files.mockResolvedValueOnce([
      createFileResult('/repo/src/renderer/components/search/GlobalSearchDialog.tsx'),
    ]);

    const view = renderDialog('files');
    const input = getSearchInput(view, 'Search file name...');

    act(() => {
      updateInputValue(input, 'GlobalSearch');
    });
    await flushDebouncedSearch();

    expect(searchApi.files).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'GlobalSearch',
        requestId: 'global-search-1',
        rootPath: '/repo',
      })
    );
    expect(view.textContent).toContain('GlobalSearchDialog.tsx');
    expect(view.textContent).toContain('src/renderer/components/search');
  });
});
