/* @vitest-environment jsdom */

import { translate } from '@shared/i18n';
import type React from 'react';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StartupShell } from '../StartupShell';
import { resolveStartupShellContent } from '../startupShellContent';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/components/layout/DeferredPanelFallback', () => ({
  DeferredPanelFallback: ({
    variant,
    eyebrow,
    title,
    description,
    icon,
    cardClassName,
    progressLabel,
    progressMax,
    progressValue,
  }: {
    variant?: string;
    eyebrow: string;
    title: string;
    description: string;
    icon?: unknown;
    cardClassName?: string;
    progressLabel?: string;
    progressMax?: number;
    progressValue?: number;
  }) =>
    createElement('div', {
      'data-variant': variant,
      'data-eyebrow': eyebrow,
      'data-title': title,
      'data-description': description,
      'data-has-icon': String(Boolean(icon)),
      'data-card-class-name': cardClassName ?? '',
      'data-progress-label': progressLabel ?? '',
      'data-progress-max': progressMax === undefined ? '' : String(progressMax),
      'data-progress-value': progressValue === undefined ? '' : String(progressValue),
    }),
}));

function mountStartupShell(element: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const root: Root = createRoot(container);
  act(() => {
    root.render(element);
  });

  return {
    container,
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('StartupShell', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

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
    expect(markup).toContain('data-progress-value="2"');
    expect(markup).toContain('data-progress-max="4"');
  });

  it('renders localized startup copy from the bootstrap locale before settings hydration', () => {
    vi.stubGlobal('window', {
      electronAPI: {
        env: {
          bootstrapLocale: 'zh',
        },
      },
    });

    const markup = renderToStaticMarkup(createElement(StartupShell));

    expect(markup).toContain(translate('zh', 'Restoring workspace'));
    expect(markup).toContain(translate('zh', 'Loading settings and repository context.'));
  });

  it('resolves failure copy for bootstrap errors', () => {
    expect(resolveStartupShellContent('bootstrap-failed')).toEqual(
      expect.objectContaining({
        title: 'Startup failed',
      })
    );
  });

  it('reconciles with the latest bootstrap stage after subscribing to stage events', () => {
    const originalAddEventListener = window.addEventListener.bind(window);

    vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
      if (type === 'infilux-bootstrap-stage-change') {
        (
          window as Window & {
            __infiluxBootstrapStage?: string;
          }
        ).__infiluxBootstrapStage = 'hydration-complete';
      }

      originalAddEventListener(type, listener, options);
    });

    (
      window as Window & {
        __infiluxBootstrapStage?: string;
      }
    ).__infiluxBootstrapStage = 'hydrating-local-storage';

    const mounted = mountStartupShell(createElement(StartupShell));

    expect(mounted.container.innerHTML).toContain('data-title="Opening workspace"');
    expect(mounted.container.innerHTML).toContain(
      'data-description="Restoring active context and preparing panels."'
    );

    mounted.unmount();
  });
});
