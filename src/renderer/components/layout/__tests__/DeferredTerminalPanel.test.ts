/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('lucide-react', () => ({
  Terminal: (props: Record<string, unknown>) => React.createElement('svg', props),
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string) => value,
  }),
}));

vi.mock('@/components/terminal/TerminalPanel', () => ({
  TerminalPanel: ({ cwd }: { cwd?: string }) =>
    React.createElement('div', {
      'data-terminal-panel': cwd ?? 'none',
    }),
}));

vi.mock('../DeferredPanelFallback', () => ({
  DeferredPanelFallback: ({ title }: { title: string }) =>
    React.createElement('div', {
      'data-deferred-panel-fallback': title,
    }),
}));

describe('DeferredTerminalPanel', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('reuses the loaded TerminalPanel component after remounting', async () => {
    const { DeferredTerminalPanel } = await import('../DeferredTerminalPanel');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(DeferredTerminalPanel, {
          shouldLoad: true,
          cwd: '/repo/current',
          isActive: true,
        })
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-terminal-panel="/repo/current"]')).not.toBeNull();

    await act(async () => {
      root.unmount();
    });

    const markup = renderToStaticMarkup(
      React.createElement(DeferredTerminalPanel, {
        shouldLoad: true,
        cwd: '/repo/next',
        isActive: true,
      })
    );

    expect(markup).toContain('data-terminal-panel="/repo/next"');
    expect(markup).not.toContain('data-deferred-panel-fallback');
  });
});
