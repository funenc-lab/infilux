import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('lucide-react', () => ({
  RectangleEllipsis: (props: Record<string, unknown>) => React.createElement('svg', props),
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string) => value,
  }),
}));

vi.mock('../ControlStateCard', () => ({
  ControlStateCard: ({ title }: { title: string }) =>
    React.createElement('div', { 'data-control-state-card': title }),
}));

vi.mock('@/components/layout/MainContent', () => ({
  MainContent: ({ activeTab }: { activeTab?: string }) =>
    React.createElement('div', { 'data-main-content': activeTab ?? 'none' }),
}));

describe('DeferredMainContent', () => {
  it('renders a loading placeholder before MainContent resolves', async () => {
    const { DeferredMainContent } = await import('../DeferredMainContent');

    const markup = renderToStaticMarkup(
      React.createElement(DeferredMainContent, {
        activeTab: 'chat',
        onTabChange: () => {},
      })
    );

    expect(markup).toContain('Loading workspace');
    expect(markup).not.toContain('data-main-content');
  });
});
