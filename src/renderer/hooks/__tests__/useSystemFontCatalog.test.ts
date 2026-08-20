/* @vitest-environment jsdom */

import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSystemFontCatalog } from '../useSystemFontCatalog';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function FontCatalogProbe() {
  const fontCatalog = useSystemFontCatalog();

  return React.createElement(
    'div',
    null,
    `${fontCatalog.families.join(',')}|${fontCatalog.monospaceFamilies.join(',')}`
  );
}

describe('useSystemFontCatalog', () => {
  let container: HTMLDivElement | undefined;
  let root: Root | undefined;
  let originalElectronApi: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalElectronApi = Object.getOwnPropertyDescriptor(window, 'electronAPI');
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    container?.remove();
    container = undefined;
    root = undefined;

    if (originalElectronApi) {
      Object.defineProperty(window, 'electronAPI', originalElectronApi);
    } else {
      Reflect.deleteProperty(window, 'electronAPI');
    }
  });

  it('loads all and monospace font families from the preload bridge', async () => {
    const listSystemFontFamilies = vi.fn().mockResolvedValue({
      families: ['Menlo', 'PingFang SC'],
      monospaceFamilies: ['Menlo'],
    });
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        app: { listSystemFontFamilies },
      },
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(React.createElement(FontCatalogProbe));
    });

    expect(container.textContent).toBe('Menlo,PingFang SC|Menlo');
    expect(listSystemFontFamilies).toHaveBeenCalledOnce();
  });
});
