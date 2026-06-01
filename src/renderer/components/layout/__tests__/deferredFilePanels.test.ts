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
  FileCode: (props: Record<string, unknown>) => React.createElement('svg', props),
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string) => value,
  }),
}));

vi.mock('@/components/ui/empty', () => ({
  Empty: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  EmptyDescription: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  EmptyHeader: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  EmptyMedia: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  EmptyTitle: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
}));

vi.mock('@/components/files/FilePanel', () => ({
  FilePanel: ({ rootPath }: { rootPath?: string }) =>
    React.createElement('div', { 'data-file-panel': rootPath ?? 'none' }),
}));

vi.mock('@/components/files/CurrentFilePanel', () => ({
  CurrentFilePanel: ({ rootPath }: { rootPath?: string }) =>
    React.createElement('div', { 'data-current-file-panel': rootPath ?? 'none' }),
}));

vi.mock('../ControlStateCard', () => ({
  ControlStateCard: ({ title }: { title: string }) =>
    React.createElement('div', { 'data-control-state-card': title }),
}));

describe('Deferred file panels', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders a loading placeholder before FilePanel resolves', async () => {
    const { DeferredFilePanel } = await import('../DeferredFilePanel');

    const markup = renderToStaticMarkup(
      React.createElement(DeferredFilePanel, {
        shouldLoad: true,
        rootPath: '/repo',
        isActive: true,
      })
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('Loading file explorer');
    expect(markup).toContain('Preparing file tree and editor workspace');
    expect(markup).not.toContain('data-file-panel');
  });

  it('suppresses the loading placeholder for FilePanel when fallback display is disabled', async () => {
    const { DeferredFilePanel } = await import('../DeferredFilePanel');

    const markup = renderToStaticMarkup(
      React.createElement(DeferredFilePanel, {
        shouldLoad: true,
        showFallback: false,
        rootPath: '/repo',
        isActive: false,
      })
    );

    expect(markup).toBe('');
  });

  it('reuses the loaded FilePanel component after remounting', async () => {
    const { DeferredFilePanel } = await import('../DeferredFilePanel');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(DeferredFilePanel, {
          shouldLoad: true,
          rootPath: '/repo/current',
          isActive: true,
        })
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-file-panel="/repo/current"]')).not.toBeNull();

    await act(async () => {
      root.unmount();
    });

    const markup = renderToStaticMarkup(
      React.createElement(DeferredFilePanel, {
        shouldLoad: true,
        rootPath: '/repo/next',
        isActive: true,
      })
    );

    expect(markup).toContain('data-file-panel="/repo/next"');
    expect(markup).not.toContain('Loading file explorer');
  });

  it('renders a loading placeholder before CurrentFilePanel resolves', async () => {
    const { DeferredCurrentFilePanel } = await import('../DeferredCurrentFilePanel');

    const markup = renderToStaticMarkup(
      React.createElement(DeferredCurrentFilePanel, {
        shouldLoad: true,
        rootPath: '/repo',
        isActive: true,
      })
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('Loading editor');
    expect(markup).toContain('Preparing active file workspace');
    expect(markup).not.toContain('data-current-file-panel');
  });

  it('suppresses the loading placeholder for CurrentFilePanel when fallback display is disabled', async () => {
    const { DeferredCurrentFilePanel } = await import('../DeferredCurrentFilePanel');

    const markup = renderToStaticMarkup(
      React.createElement(DeferredCurrentFilePanel, {
        shouldLoad: true,
        showFallback: false,
        rootPath: '/repo',
        isActive: false,
      })
    );

    expect(markup).toBe('');
  });

  it('reuses the loaded CurrentFilePanel component after remounting', async () => {
    const { DeferredCurrentFilePanel } = await import('../DeferredCurrentFilePanel');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(DeferredCurrentFilePanel, {
          shouldLoad: true,
          rootPath: '/repo/current',
          isActive: true,
        })
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-current-file-panel="/repo/current"]')).not.toBeNull();

    await act(async () => {
      root.unmount();
    });

    const markup = renderToStaticMarkup(
      React.createElement(DeferredCurrentFilePanel, {
        shouldLoad: true,
        rootPath: '/repo/next',
        isActive: true,
      })
    );

    expect(markup).toContain('data-current-file-panel="/repo/next"');
    expect(markup).not.toContain('Loading editor');
  });
});
