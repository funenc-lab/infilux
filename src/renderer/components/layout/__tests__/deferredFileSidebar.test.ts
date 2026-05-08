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

vi.mock('@/components/files/FileSidebar', () => ({
  FileSidebar: ({ rootPath }: { rootPath?: string }) =>
    React.createElement('div', { 'data-file-sidebar': rootPath ?? 'none' }),
}));

vi.mock('../ControlStateCard', () => ({
  ControlStateCard: ({ title }: { title: string }) =>
    React.createElement('div', { 'data-control-state-card': title }),
}));

describe('DeferredFileSidebar', () => {
  it('renders a loading placeholder before FileSidebar resolves', async () => {
    const { DeferredFileSidebar } = await import('../DeferredFileSidebar');

    const markup = renderToStaticMarkup(
      React.createElement(DeferredFileSidebar, {
        shouldLoad: true,
        rootPath: '/repo',
        width: 280,
        collapsed: false,
        onCollapse: () => {},
        onExpand: () => {},
        onResizeStart: () => {},
      })
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('Loading file explorer');
    expect(markup).toContain('Preparing file tree and editor workspace');
    expect(markup).not.toContain('data-file-sidebar');
  });

  it('suppresses the loading placeholder when fallback display is disabled', async () => {
    const { DeferredFileSidebar } = await import('../DeferredFileSidebar');

    const markup = renderToStaticMarkup(
      React.createElement(DeferredFileSidebar, {
        shouldLoad: true,
        showFallback: false,
        rootPath: '/repo',
        width: 280,
        collapsed: false,
        onCollapse: () => {},
        onExpand: () => {},
        onResizeStart: () => {},
      })
    );

    expect(markup).toBe('');
  });
});
