import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

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
});
