/* @vitest-environment jsdom */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ui/menu', () => ({
  Menu: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children as React.ReactNode),
  MenuItem: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) =>
    React.createElement('button', { type: 'button', ...props }, children as React.ReactNode),
  MenuPopup: ({
    children,
    align: _align,
    side: _side,
    sideOffset: _sideOffset,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & {
    children?: React.ReactNode;
    align?: string;
    side?: string;
    sideOffset?: number;
  }) => React.createElement('div', props, children as React.ReactNode),
  MenuSeparator: (props: React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement('div', { ...props, 'data-slot': 'menu-separator' }),
  MenuTrigger: ({ render }: { render?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, render as React.ReactNode),
}));

function TriggerIcon(props: React.SVGProps<SVGSVGElement>) {
  return React.createElement('svg', { ...props, 'data-icon': 'trigger' });
}

function ActionIcon(props: React.SVGProps<SVGSVGElement>) {
  return React.createElement('svg', { ...props, 'data-icon': 'action' });
}

describe('CollapsedSidebarRail', () => {
  it('renders a collapsed trigger with grouped menu actions', async () => {
    const { CollapsedSidebarRail } = await import('../CollapsedSidebarRail');

    const markup = renderToStaticMarkup(
      React.createElement(CollapsedSidebarRail, {
        label: 'Repository',
        triggerTitle: 'Repository actions',
        icon: TriggerIcon,
        actions: [
          {
            id: 'expand',
            label: 'Expand Repository',
            icon: ActionIcon,
            onSelect: vi.fn(),
          },
          {
            id: 'refresh',
            label: 'Refresh',
            icon: ActionIcon,
            onSelect: vi.fn(),
            separatorBefore: true,
          },
        ],
      })
    );

    expect(markup).toContain('Repository actions');
    expect(markup).toContain('Expand Repository');
    expect(markup).toContain('Refresh');
    expect(markup).toContain('data-slot="menu-separator"');
    expect(markup).toContain('data-collapsed-sidebar="Repository"');
  });
});
