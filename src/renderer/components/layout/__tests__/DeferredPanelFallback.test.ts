import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { DeferredPanelFallbackVariant } from '../DeferredPanelFallback';

vi.mock('@/components/ui/spinner', () => ({
  Spinner: (props: Record<string, unknown>) =>
    React.createElement('div', { ...props, 'data-spinner': 'true' }),
}));

vi.mock('../ControlStateCard', () => ({
  ControlStateCard: ({ title, footer }: { title: string; footer?: React.ReactNode }) =>
    React.createElement(
      'div',
      {
        'data-control-state-card': title,
        'data-has-footer': String(Boolean(footer)),
      },
      footer
    ),
}));

describe('DeferredPanelFallback', () => {
  it('renders an embedded loading shell by default', async () => {
    const { DeferredPanelFallback } = await import('../DeferredPanelFallback');

    const markup = renderToStaticMarkup(
      React.createElement(DeferredPanelFallback, {
        icon: React.createElement('span', null, 'icon'),
        eyebrow: 'Agent Console',
        title: 'Loading AI Agent',
        description: 'Preparing agent sessions and terminal workspace',
      })
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).not.toContain('data-control-state-card=');
    expect(markup).toContain('motion-safe:animate-pulse');
  });

  it('uses the fullscreen card variant when requested', async () => {
    const { DeferredPanelFallback } = await import('../DeferredPanelFallback');

    const markup = renderToStaticMarkup(
      React.createElement(DeferredPanelFallback, {
        icon: React.createElement('span', null, 'icon'),
        eyebrow: 'Infilux',
        title: 'Restoring workspace',
        description: 'Syncing settings, session state, and repository context.',
        variant: 'fullscreen',
      })
    );

    expect(markup).toContain('data-control-state-card="Restoring workspace"');
    expect(markup).toContain('data-has-footer="true"');
    expect(markup).toContain('data-spinner="true"');
  });

  it('renders a dedicated startup layout without the generic fullscreen card treatment', async () => {
    const { DeferredPanelFallback } = await import('../DeferredPanelFallback');
    const variant: DeferredPanelFallbackVariant = 'startup';

    const markup = renderToStaticMarkup(
      React.createElement(DeferredPanelFallback, {
        icon: React.createElement('span', null, 'icon'),
        eyebrow: 'Infilux',
        title: 'Restoring workspace',
        description: 'Loading settings and repository context.',
        variant,
      })
    );

    expect(markup).toContain('data-startup-fallback="true"');
    expect(markup).toContain('class="flex min-h-screen items-center justify-center');
    expect(markup).not.toContain('data-control-state-card=');
    expect(markup).not.toContain('data-spinner="true"');
  });

  it('prefers a custom footer over the default embedded loading treatment', async () => {
    const { DeferredPanelFallback } = await import('../DeferredPanelFallback');

    const markup = renderToStaticMarkup(
      React.createElement(DeferredPanelFallback, {
        icon: React.createElement('span', null, 'icon'),
        eyebrow: 'Infilux',
        title: 'Restoring workspace',
        description: 'Syncing settings, session state, and repository context.',
        footer: React.createElement('div', { 'data-custom-footer': 'true' }),
      })
    );

    expect(markup).toContain('data-custom-footer="true"');
    expect(markup).not.toContain('data-spinner="true"');
  });
});
