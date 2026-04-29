/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchPreviewPanel } from '../SearchPreviewPanel';

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

const fileRead = vi.fn();

const settingsState = {
  theme: 'dark',
  terminalTheme: 'dark',
  colorPreset: 'default',
  customAccentColor: null,
  activeThemeSelection: null,
  customThemes: [],
  editorSettings: {
    fontSize: 13,
    fontFamily: 'Menlo',
  },
};

vi.mock('@monaco-editor/react', () => ({
  default: ({ value }: { value: string }) =>
    React.createElement('pre', { 'data-testid': 'editor' }, value),
}));

vi.mock('@/components/files/editorThemePalette', () => ({
  resolveEditorVisualPalette: () => ({ accent: '#8ab4ff' }),
  withAlpha: (color: string, alpha: string) => `${color}${alpha}`,
}));

vi.mock('@/components/files/monacoSetup', () => ({
  ensureMonacoSetup: () => Promise.resolve(),
}));

vi.mock('@/components/files/monacoTheme', () => ({
  CUSTOM_THEME_NAME: 'test-theme',
  defineMonacoTheme: vi.fn(),
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('@/lib/appTheme', () => ({
  findCustomThemeBySelection: () => null,
}));

vi.mock('@/lib/monacoModelPath', () => ({
  toMonacoVirtualUri: (_scope: string, path: string) => path,
}));

vi.mock('@/stores/settings', () => ({
  useSettingsStore: (selector: (state: typeof settingsState) => unknown) => selector(settingsState),
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function renderPreview(path: string) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(React.createElement(SearchPreviewPanel, { path, query: 'needle', line: 1 }));
    await Promise.resolve();
  });

  return container;
}

describe('SearchPreviewPanel', () => {
  beforeEach(() => {
    fileRead.mockReset();
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        file: {
          read: fileRead,
        },
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
    vi.restoreAllMocks();
  });

  it('ignores stale file reads after the selected preview path changes', async () => {
    const firstRead = createDeferred<{ content: string }>();
    const secondRead = createDeferred<{ content: string }>();
    fileRead.mockReturnValueOnce(firstRead.promise).mockReturnValueOnce(secondRead.promise);

    const view = await renderPreview('/repo/first.ts');
    await renderPreview('/repo/second.ts');

    await act(async () => {
      secondRead.resolve({ content: 'second file content' });
      await secondRead.promise;
    });

    expect(view.textContent).toContain('second file content');

    await act(async () => {
      firstRead.resolve({ content: 'first file content' });
      await firstRead.promise;
    });

    expect(view.textContent).toContain('second file content');
    expect(view.textContent).not.toContain('first file content');
  });
});
