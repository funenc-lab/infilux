/* @vitest-environment jsdom */

import React, { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TokenUsagePopover } from '../TokenUsagePopover';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('lucide-react', () => ({
  ChartNoAxesColumnIncreasing: (props: Record<string, unknown>) =>
    React.createElement('svg', props),
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string) => value,
  }),
}));

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({
    children,
    onOpenChange,
  }: {
    children?: React.ReactNode;
    onOpenChange?: (open: boolean) => void;
  }) =>
    React.createElement(
      'div',
      {
        onClick: () => onOpenChange?.(true),
      },
      children
    ),
  SheetTrigger: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) =>
    React.createElement('button', { type: 'button', ...props }, children),
}));

vi.mock('../TokenUsageDrawer', () => ({
  TokenUsageDrawer: ({ open }: { open: boolean }) =>
    React.createElement('div', { 'data-token-usage-drawer-open': String(open) }),
}));

function mountPopover() {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const root: Root = createRoot(container);
  act(() => {
    root.render(createElement(TokenUsagePopover, { className: 'toolbar-button' }));
  });

  return {
    container,
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('TokenUsagePopover', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('opens the dedicated token usage drawer from the toolbar trigger', () => {
    const view = mountPopover();

    try {
      const trigger = view.container.querySelector('button');

      expect(trigger?.getAttribute('aria-label')).toBe('Token Usage');
      expect(
        view.container
          .querySelector('[data-token-usage-drawer-open]')
          ?.getAttribute('data-token-usage-drawer-open')
      ).toBe('false');

      act(() => {
        trigger?.click();
      });

      expect(
        view.container
          .querySelector('[data-token-usage-drawer-open]')
          ?.getAttribute('data-token-usage-drawer-open')
      ).toBe('true');
    } finally {
      view.unmount();
    }
  });
});
