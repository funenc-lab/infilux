/* @vitest-environment jsdom */

import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FontFamilyPresetSelect, filterFontPresetOptions } from '../FontFamilyPresetSelect';

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
    {
      disabled: false,
      fontFamily: 'Fira Code, Menlo, Monaco, Consolas, monospace',
      id: 'fira-code',
      label: 'Fira Code',
    },
    {
      disabled: true,
      id: 'custom',
      label: 'Custom font stack',
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

  it('filters font options by their visible font name', () => {
    expect(filterFontPresetOptions(selection.options, 'fira')).toEqual([selection.options[1]]);
    expect(filterFontPresetOptions(selection.options, '  ')).toEqual(selection.options);
  });

  it('gives the dropdown trigger an accessible name', async () => {
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

    const trigger = container.querySelector<HTMLElement>('[data-slot="font-family-trigger"]');

    expect(trigger?.getAttribute('aria-label')).toBe('Font family');
    expect(trigger?.tagName).toBe('BUTTON');
  });

  it('sizes the popup positioner to the visible popup for collision avoidance', async () => {
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

    const trigger = container.querySelector<HTMLElement>('[data-slot="font-family-trigger"]');

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const popup = document.body.querySelector<HTMLElement>('[data-slot="font-family-popup"]');
    const positioner = popup?.parentElement;

    expect(positioner?.className).toContain('w-fit');
    expect(positioner?.className).toContain('h-fit');
  });

  it('keeps the popup compact and filters results without showing CSS fallback stacks', async () => {
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

    const trigger = container.querySelector<HTMLElement>('[data-slot="font-family-trigger"]');

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const popup = document.body.querySelector<HTMLElement>('[data-slot="font-family-popup"]');
    const searchInput = document.body.querySelector<HTMLInputElement>(
      '[data-slot="font-family-search"]'
    );

    expect(popup?.parentElement?.style.position).toBe('fixed');
    expect(popup?.className).toContain('w-[min(30rem,calc(100vw-1rem))]');
    expect(popup?.className).toContain('h-80');
    expect(document.body.textContent).toContain('JetBrains Mono');
    expect(document.body.textContent).not.toContain('Menlo, Monaco, Consolas, monospace');

    await act(async () => {
      if (searchInput) {
        searchInput.value = 'fira';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    const options = Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"]'));

    expect(options).toHaveLength(1);
    expect(options[0]?.textContent).toContain('Fira Code');
  });

  it('forwards the selected preset identifier through keyboard selection', async () => {
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

    const trigger = container.querySelector<HTMLElement>('[data-slot="font-family-trigger"]');

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const searchInput = document.body.querySelector<HTMLInputElement>(
      '[data-slot="font-family-search"]'
    );

    await act(async () => {
      if (searchInput) {
        searchInput.value = 'fira';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
      }
    });

    expect(onValueChange).toHaveBeenCalledWith('fira-code');
  });
});
