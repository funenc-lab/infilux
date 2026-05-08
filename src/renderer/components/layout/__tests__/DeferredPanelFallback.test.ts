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
    expect(markup).toContain('data-deferred-fallback="embedded"');
    expect(markup).toContain('data-loading-layout="status-dock"');
    expect(markup).not.toContain('data-control-state-card=');
    expect(markup).not.toContain('rounded-[18px]');
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
    expect(markup).toContain('data-loading-layout="status-dock"');
    expect(markup).toContain('class="flex min-h-screen items-center justify-center p-6');
    expect(markup).not.toContain('data-control-state-card=');
    expect(markup).not.toContain('data-spinner="true"');
  });

  it('matches the static bootstrap shell geometry for startup fallbacks', async () => {
    const { DeferredPanelFallback } = await import('../DeferredPanelFallback');

    const markup = renderToStaticMarkup(
      React.createElement(DeferredPanelFallback, {
        icon: React.createElement('span', null, 'icon'),
        eyebrow: 'Infilux',
        title: 'Restoring workspace',
        description: 'Loading settings and repository context.',
        progressLabel: 'Restoring workspace',
        progressMax: 4,
        progressValue: 1,
        variant: 'startup',
      })
    );

    expect(markup).toContain('data-startup-fallback="true"');
    expect(markup).toContain('max-w-[36rem]');
    expect(markup).toContain('px-5 py-5');
    expect(markup).toContain('h-11 w-11');
    expect(markup).toContain('rounded-2xl');
    expect(markup).toContain('text-[19px]');
    expect(markup).toContain('leading-[1.2]');
    expect(markup).toContain('text-sm leading-[1.6]');
    expect(markup).toContain('data-startup-progress-label="true"');
    expect(markup).toContain('sr-only');
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
