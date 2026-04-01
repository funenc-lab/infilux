import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

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
  it('renders a loading placeholder before FilePanel resolves', async () => {
    const { DeferredFilePanel } = await import('../DeferredFilePanel');

    const markup = renderToStaticMarkup(
      React.createElement(DeferredFilePanel, {
        shouldLoad: true,
        rootPath: '/repo',
        isActive: true,
      })
    );

    expect(markup).toContain('data-control-state-card="Loading file explorer"');
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

  it('renders a loading placeholder before CurrentFilePanel resolves', async () => {
    const { DeferredCurrentFilePanel } = await import('../DeferredCurrentFilePanel');

    const markup = renderToStaticMarkup(
      React.createElement(DeferredCurrentFilePanel, {
        shouldLoad: true,
        rootPath: '/repo',
        isActive: true,
      })
    );

    expect(markup).toContain('data-control-state-card="Loading editor"');
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
});
