/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string) => value,
  }),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    variant: _variant,
    size: _size,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    children?: React.ReactNode;
    variant?: string;
    size?: string;
  }) => React.createElement('button', { type: 'button', ...props }, children as React.ReactNode),
}));

import { SessionPersistenceNotice } from '../SessionPersistenceNotice';

describe('SessionPersistenceNotice', () => {
  let root: Root | null = null;

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    document.body.innerHTML = '';
  });

  it('renders the tmux recovery warning and action copy', () => {
    const markup = renderToStaticMarkup(
      React.createElement(SessionPersistenceNotice, {
        kind: 'tmux-disabled',
        isPending: false,
        onAction: () => undefined,
      })
    );

    expect(markup).toContain('Tmux Session');
    expect(markup).toContain('Local session recovery is disabled.');
    expect(markup).toContain(
      'Local agent sessions started without tmux will not restore after app restart. Enable recovery before starting the next session.'
    );
    expect(markup).toContain('Enable Recovery');
  });

  it('renders the unrecoverable session warning and restart guidance', () => {
    const markup = renderToStaticMarkup(
      React.createElement(SessionPersistenceNotice, {
        kind: 'recovery-required',
        onAction: () => undefined,
      })
    );

    expect(markup).toContain('Session Recovery');
    expect(markup).toContain('Automatic recovery is unavailable for this session.');
    expect(markup).toContain(
      'Persistent host recovery is unavailable and this session cannot resume automatically. Start a fresh session to continue.'
    );
    expect(markup).toContain('Start fresh session');
  });

  it('keeps the overlay non-blocking while preserving button interaction', () => {
    const markup = renderToStaticMarkup(
      React.createElement(SessionPersistenceNotice, {
        kind: 'recovery-required',
        onAction: () => undefined,
      })
    );

    expect(markup).toContain('pointer-events-none absolute right-3 top-3');
    expect(markup).toContain('mt-3 flex justify-end pointer-events-auto');
  });

  it('uses semantic warning tokens without a decorative gradient or wide shadow', () => {
    const markup = renderToStaticMarkup(
      React.createElement(SessionPersistenceNotice, {
        kind: 'tmux-disabled',
      })
    );

    expect(markup).toContain('border-warning/28');
    expect(markup).toContain('bg-warning/10');
    expect(markup).toContain('text-warning');
    expect(markup).not.toContain('amber-500');
    expect(markup).not.toContain('linear-gradient');
    expect(markup).not.toContain('shadow-[0_18px_44px');
  });

  it('renders an accessible dismiss control when dismissal is available', () => {
    const markup = renderToStaticMarkup(
      React.createElement(SessionPersistenceNotice, {
        kind: 'recovery-required',
        onDismiss: () => undefined,
      })
    );

    expect(markup).toContain('aria-label="Close"');
    expect(markup).toContain('title="Close"');
    expect(markup).toContain('pointer-events-auto');
  });

  it('calls the dismiss handler from the close control', async () => {
    const onDismiss = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(SessionPersistenceNotice, {
          kind: 'recovery-required',
          onDismiss,
        })
      );
    });

    const closeButton = container.querySelector('button[aria-label="Close"]');
    expect(closeButton).not.toBeNull();

    await act(async () => {
      closeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
