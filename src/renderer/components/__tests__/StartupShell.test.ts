import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { StartupShell } from '../StartupShell';
import { resolveStartupShellContent } from '../startupShellContent';

vi.mock('@/components/layout/DeferredPanelFallback', () => ({
  DeferredPanelFallback: ({
    variant,
    eyebrow,
    title,
    description,
    icon,
    cardClassName,
  }: {
    variant?: string;
    eyebrow: string;
    title: string;
    description: string;
    icon?: unknown;
    cardClassName?: string;
  }) =>
    createElement('div', {
      'data-variant': variant,
      'data-eyebrow': eyebrow,
      'data-title': title,
      'data-description': description,
      'data-has-icon': String(Boolean(icon)),
      'data-card-class-name': cardClassName ?? '',
    }),
}));

describe('StartupShell', () => {
  it('renders the startup copy for early bootstrap feedback', () => {
    const markup = renderToStaticMarkup(createElement(StartupShell));

    expect(markup).toContain('data-variant="startup"');
    expect(markup).toContain('data-has-icon="true"');
    expect(markup).toContain('Infilux');
    expect(markup).toContain('Restoring workspace');
    expect(markup).toContain('Loading settings and repository context.');
    expect(markup).toContain('data-card-class-name=""');
  });

  it('renders stage-specific copy for module loading progress', () => {
    const markup = renderToStaticMarkup(
      createElement(StartupShell, {
        stage: 'importing-app',
      })
    );

    expect(markup).toContain('Loading shell');
    expect(markup).toContain('Preparing runtime modules and workspace services.');
  });

  it('resolves failure copy for bootstrap errors', () => {
    expect(resolveStartupShellContent('bootstrap-failed')).toEqual(
      expect.objectContaining({
        title: 'Startup failed',
      })
    );
  });
});
