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
        isPending: false,
        onEnableRecovery: () => undefined,
      })
    );

    expect(markup).toContain('Tmux Session');
    expect(markup).toContain('Local session recovery is disabled.');
    expect(markup).toContain(
      'Local agent sessions started without tmux will not restore after app restart. Enable recovery before starting the next session.'
    );
    expect(markup).toContain('Enable Recovery');
  });
});
