import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DeferredCurrentFilePanel } from '../DeferredCurrentFilePanel';
import { DeferredFilePanel } from '../DeferredFilePanel';

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
  it('renders FilePanel immediately when shouldLoad is true', () => {
    const markup = renderToStaticMarkup(
      React.createElement(DeferredFilePanel, {
        shouldLoad: true,
        rootPath: '/repo',
        isActive: true,
      })
    );

    expect(markup).toContain('data-file-panel="/repo"');
    expect(markup).not.toContain('Loading file explorer');
  });

  it('renders CurrentFilePanel immediately when shouldLoad is true', () => {
    const markup = renderToStaticMarkup(
      React.createElement(DeferredCurrentFilePanel, {
        shouldLoad: true,
        rootPath: '/repo',
        isActive: true,
      })
    );

    expect(markup).toContain('data-current-file-panel="/repo"');
    expect(markup).not.toContain('Loading editor');
  });
});
