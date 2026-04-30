/* @vitest-environment jsdom */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('lucide-react', () => ({
  ChevronRight: (props: React.SVGProps<SVGSVGElement>) =>
    React.createElement('svg', { ...props, 'data-icon': 'expand-indicator' }),
  MoreHorizontal: (props: React.SVGProps<SVGSVGElement>) =>
    React.createElement('svg', { ...props, 'data-icon': 'more-horizontal' }),
}));

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

vi.mock('../SidebarToolbarTooltip', () => ({
  SidebarToolbarTooltip: ({
    label,
    side,
    align,
    sideOffset,
    children,
  }: {
    label: React.ReactNode;
    side?: string;
    align?: string;
    sideOffset?: number;
    children?: React.ReactNode;
  }) =>
    React.createElement(
      'span',
      {
        'data-label': typeof label === 'string' ? label : undefined,
        'data-side': side,
        'data-align': align,
        'data-side-offset': sideOffset,
        'data-slot': 'sidebar-toolbar-tooltip',
      },
      children as React.ReactNode
    ),
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
    expect(markup).toContain('data-slot="collapsed-sidebar-trigger-icon"');
    expect(markup).toContain('data-slot="collapsed-sidebar-expand-indicator"');
    expect(markup).toContain('data-icon="trigger"');
    expect(markup).toContain('data-icon="expand-indicator"');
  });

  it('renders a direct primary expand action when provided', async () => {
    const { CollapsedSidebarRail } = await import('../CollapsedSidebarRail');

    const markup = renderToStaticMarkup(
      React.createElement(CollapsedSidebarRail, {
        label: 'Repository',
        triggerTitle: 'Repository actions',
        icon: TriggerIcon,
        contextAction: React.createElement('button', {
          type: 'button',
          'data-slot': 'custom-running-projects',
        }),
        primaryAction: {
          id: 'expand',
          label: 'Expand Repository',
          icon: ActionIcon,
          onSelect: vi.fn(),
        },
        secondaryAction: {
          id: 'add',
          label: 'Add Repository',
          icon: ActionIcon,
          onSelect: vi.fn(),
        },
        actions: [
          {
            id: 'refresh',
            label: 'Refresh',
            icon: ActionIcon,
            onSelect: vi.fn(),
          },
        ],
      })
    );

    const primaryIndex = markup.indexOf('data-slot="collapsed-sidebar-primary-button"');
    const contextIndex = markup.indexOf('data-slot="collapsed-sidebar-context-action"');
    const secondaryIndex = markup.indexOf('data-slot="collapsed-sidebar-secondary-action"');
    const menuIndex = markup.indexOf('data-slot="collapsed-sidebar-menu-action"');

    expect(primaryIndex).toBeGreaterThanOrEqual(0);
    expect(contextIndex).toBeGreaterThan(primaryIndex);
    expect(secondaryIndex).toBeGreaterThan(contextIndex);
    expect(menuIndex).toBeGreaterThan(secondaryIndex);
    expect(markup).toContain('data-slot="collapsed-sidebar-primary-action"');
    expect(markup).toContain('control-collapsed-sidebar-context-action');
    expect(markup).toContain('data-slot="collapsed-sidebar-context-action"');
    expect(markup).toContain('data-slot="custom-running-projects"');
    expect(markup).toContain('data-slot="collapsed-sidebar-secondary-button"');
    expect(markup).toContain('data-slot="sidebar-toolbar-tooltip"');
    expect(markup).toContain('data-label="Add Repository"');
    expect(markup).toContain('data-side="inline-end"');
    expect(markup).toContain('data-align="center"');
    expect(markup).toContain('data-slot="collapsed-sidebar-menu-button"');
    expect(markup).toContain('Expand Repository');
    expect(markup).toContain('Add Repository');
    expect(markup).toContain('Repository actions');
    expect(markup).toContain('data-icon="more-horizontal"');
    expect(markup).not.toContain('data-icon="expand-indicator"');
  });
});
