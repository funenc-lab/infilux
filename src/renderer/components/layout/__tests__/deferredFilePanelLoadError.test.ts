import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loaderMocks = vi.hoisted(() => ({
  retry: vi.fn(),
  state: {
    Component: null as React.ComponentType<Record<string, never>> | null,
    error: new Error('chunk unavailable') as Error | null,
    retry: vi.fn(),
  },
}));

vi.mock('lucide-react', () => {
  const icon = (name: string) => (props: Record<string, unknown>) =>
    React.createElement('svg', { ...props, 'data-icon': name });

  return {
    AlertTriangle: icon('AlertTriangle'),
    FileCode: icon('FileCode'),
    RefreshCw: icon('RefreshCw'),
  };
});

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string) => value,
  }),
}));

vi.mock('../ControlStateCard', () => ({
  ControlStateCard: ({
    title,
    description,
    metaValue,
    actions,
  }: {
    title: string;
    description: string;
    metaValue?: string;
    actions?: React.ReactNode;
  }) =>
    React.createElement(
      'section',
      { 'data-control-state-card': title },
      title,
      description,
      metaValue,
      actions
    ),
}));

vi.mock('../ControlStateActionButton', () => ({
  ControlStateActionButton: ({ children }: { children?: React.ReactNode; onClick?: () => void }) =>
    React.createElement('button', { type: 'button' }, children),
}));

vi.mock('../useDeferredComponentLoader', () => ({
  useDeferredComponentLoader: () => loaderMocks.state,
}));

describe('Deferred file panel load errors', () => {
  beforeEach(() => {
    loaderMocks.state.Component = null;
    loaderMocks.state.error = new Error('chunk unavailable');
    loaderMocks.state.retry = loaderMocks.retry;
    loaderMocks.retry.mockClear();
  });

  it('shows a recoverable error instead of the FilePanel loading placeholder', async () => {
    const { DeferredFilePanel } = await import('../DeferredFilePanel');

    const markup = renderToStaticMarkup(
      React.createElement(DeferredFilePanel, {
        shouldLoad: true,
        rootPath: '/repo',
        isActive: true,
      })
    );

    expect(markup).toContain('Unable to load file');
    expect(markup).toContain('Unable to load resources.');
    expect(markup).toContain('chunk unavailable');
    expect(markup).toContain('Retry');
    expect(markup).not.toContain('Preparing file tree and editor workspace');
  });

  it('shows a recoverable error instead of the CurrentFilePanel loading placeholder', async () => {
    const { DeferredCurrentFilePanel } = await import('../DeferredCurrentFilePanel');

    const markup = renderToStaticMarkup(
      React.createElement(DeferredCurrentFilePanel, {
        shouldLoad: true,
        rootPath: '/repo',
        isActive: true,
      })
    );

    expect(markup).toContain('Unable to load file');
    expect(markup).toContain('Unable to load resources.');
    expect(markup).toContain('chunk unavailable');
    expect(markup).toContain('Retry');
    expect(markup).not.toContain('Preparing active file workspace');
  });
});
