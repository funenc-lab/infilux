/* @vitest-environment jsdom */

import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FontFamilyPresetSelect } from '../FontFamilyPresetSelect';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string) => value,
  }),
}));

const selection = {
  options: [
    {
      disabled: false,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
      id: 'jetbrains-mono',
      label: 'JetBrains Mono',
    },
  ],
  selectedId: 'jetbrains-mono',
  selectedLabel: 'JetBrains Mono',
};

describe('FontFamilyPresetSelect', () => {
  let container: HTMLDivElement | undefined;
  let root: Root | undefined;

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    container?.remove();
    container = undefined;
    root = undefined;
  });

  it('gives the select trigger an accessible name', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(FontFamilyPresetSelect, {
          label: 'Font family',
          selection,
          onValueChange: vi.fn(),
        })
      );
    });

    const trigger = container.querySelector<HTMLElement>('[data-slot="select-trigger"]');

    expect(trigger?.getAttribute('aria-label')).toBe('Font family');
  });

  it('forwards the selected preset identifier', async () => {
    const onValueChange = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(FontFamilyPresetSelect, {
          label: 'Font family',
          selection,
          onValueChange,
        })
      );
    });

    const trigger = container.querySelector<HTMLElement>('[data-slot="select-trigger"]');

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const option = Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"]')).find(
      (candidate) => candidate.textContent?.includes('JetBrains Mono')
    );

    expect(option).toBeDefined();
    expect(option?.textContent).toContain('JetBrains Mono, Menlo, Monaco, Consolas, monospace');

    await act(async () => {
      option?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onValueChange).toHaveBeenCalledWith('jetbrains-mono');
  });
});
