import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string, vars?: Record<string, string>) => {
      if (!vars) return value;
      return Object.entries(vars).reduce(
        (result, [key, nextValue]) => result.replace(`{{${key}}}`, nextValue),
        value
      );
    },
  }),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) =>
    React.createElement('button', { type: 'button', ...props }, children as React.ReactNode),
}));

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({
    children,
    open,
  }: {
    children?: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => (open ? React.createElement('div', { 'data-slot': 'alert-dialog' }, children) : null),
  AlertDialogPopup: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) =>
    React.createElement('div', props, children as React.ReactNode),
  AlertDialogHeader: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) =>
    React.createElement('div', props, children as React.ReactNode),
  AlertDialogTitle: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLHeadingElement> & { children?: React.ReactNode }) =>
    React.createElement('h2', props, children as React.ReactNode),
  AlertDialogDescription: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLParagraphElement> & { children?: React.ReactNode }) =>
    React.createElement('p', props, children as React.ReactNode),
  AlertDialogFooter: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) =>
    React.createElement('div', props, children as React.ReactNode),
  AlertDialogClose: ({ render }: { render?: React.ReactElement }) => render ?? null,
}));

import { AgentCloseSessionDialog } from '../AgentCloseSessionDialog';

describe('AgentCloseSessionDialog', () => {
  it('renders nothing when there is no pending close request', () => {
    const markup = renderToStaticMarkup(
      React.createElement(AgentCloseSessionDialog, {
        pendingCloseSession: null,
        onConfirm: vi.fn(),
        onOpenChange: vi.fn(),
      })
    );

    expect(markup).toBe('');
  });

  it('renders destructive confirmation copy for the selected session', () => {
    const markup = renderToStaticMarkup(
      React.createElement(AgentCloseSessionDialog, {
        pendingCloseSession: {
          id: 'session-1',
          groupId: 'group-1',
          name: 'Codex Review',
        },
        onConfirm: vi.fn(),
        onOpenChange: vi.fn(),
      })
    );

    expect(markup).toContain('Close session');
    expect(markup).toContain(
      'Stop &quot;Codex Review&quot; and remove it from this worktree view?'
    );
    expect(markup).toContain('Cancel');
  });
});
