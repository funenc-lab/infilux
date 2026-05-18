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
  Sparkles: (props: Record<string, unknown>) => React.createElement('svg', props),
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string) => value,
  }),
}));

vi.mock('@/components/chat/AgentPanel', () => ({
  AgentPanel: ({ cwd }: { cwd: string }) =>
    React.createElement('div', {
      'data-agent-panel': 'true',
      'data-cwd': cwd,
    }),
}));

vi.mock('../DeferredPanelFallback', () => ({
  DeferredPanelFallback: ({ title }: { title: string }) =>
    React.createElement('div', {
      'data-deferred-panel-fallback': title,
    }),
}));

describe('DeferredAgentPanel', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.resetModules();
  });

  it('uses a preloaded AgentPanel component before the panel is mounted', async () => {
    const { DeferredAgentPanel, preloadAgentPanelComponent } = await import(
      '../DeferredAgentPanel'
    );

    await preloadAgentPanelComponent();

    const markup = renderToStaticMarkup(
      React.createElement(DeferredAgentPanel, {
        repoPath: '/repo',
        cwd: '/repo/worktrees/preloaded',
        shouldLoad: false,
      })
    );

    expect(markup).toContain('data-agent-panel="true"');
    expect(markup).toContain('data-cwd="/repo/worktrees/preloaded"');
    expect(markup).not.toContain('data-deferred-panel-fallback');
  });

  it('reuses the loaded AgentPanel component after remounting', async () => {
    const { DeferredAgentPanel } = await import('../DeferredAgentPanel');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(DeferredAgentPanel, {
          repoPath: '/repo',
          cwd: '/repo/worktrees/current',
        })
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-agent-panel="true"]')).not.toBeNull();

    await act(async () => {
      root.unmount();
    });

    const markup = renderToStaticMarkup(
      React.createElement(DeferredAgentPanel, {
        repoPath: '/repo',
        cwd: '/repo/worktrees/next',
      })
    );

    expect(markup).toContain('data-agent-panel="true"');
    expect(markup).toContain('data-cwd="/repo/worktrees/next"');
    expect(markup).not.toContain('data-deferred-panel-fallback');
  });
});
