/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SidebarHoverRevealGroup } from '../SidebarHoverRevealGroup';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('SidebarHoverRevealGroup', () => {
  beforeEach(() => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('isolates pointer reveal state from its stable sidebar children', async () => {
    const childRender = vi.fn();
    function SidebarChild() {
      childRender();
      return React.createElement('button', { type: 'button' }, 'Repository');
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(
          SidebarHoverRevealGroup,
          { enabled: true },
          React.createElement(SidebarChild)
        )
      );
    });

    const group = container.querySelector<HTMLElement>('[data-sidebar-hover-reveal-group]');
    expect(group?.dataset.sidebarHoverRevealState).toBe('closed');
    expect(childRender).toHaveBeenCalledTimes(1);

    await act(async () => {
      group?.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, buttons: 0 }));
    });

    expect(group?.dataset.sidebarHoverRevealState).toBe('open');
    expect(childRender).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
  });

  it('stays open when the pointer moves into a sidebar-owned portal', async () => {
    const container = document.createElement('div');
    const portal = document.createElement('div');
    portal.dataset.sidebarFloatingMenuPortal = 'true';
    document.body.append(container, portal);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(
          SidebarHoverRevealGroup,
          { enabled: true },
          React.createElement('button', { type: 'button' }, 'Repository')
        )
      );
    });

    const group = container.querySelector<HTMLElement>('[data-sidebar-hover-reveal-group]');
    await act(async () => {
      group?.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, buttons: 0 }));
    });

    expect(group?.dataset.sidebarHoverRevealState).toBe('open');

    await act(async () => {
      group?.dispatchEvent(new MouseEvent('pointerout', { bubbles: true, relatedTarget: portal }));
    });

    expect(group?.dataset.sidebarHoverRevealState).toBe('open');

    portal.remove();
    await act(async () => {
      document.body.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    });

    expect(group?.dataset.sidebarHoverRevealState).toBe('closed');

    await act(async () => {
      root.unmount();
    });
  });

  it('stays open while the pointer remains inside the visible floating surface', async () => {
    const container = document.createElement('div');
    const outsideTarget = document.createElement('div');
    document.body.append(container, outsideTarget);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(
          SidebarHoverRevealGroup,
          { enabled: true },
          React.createElement('div', { 'data-sidebar-hover-content': 'true' }, 'Repositories')
        )
      );
    });

    const group = container.querySelector<HTMLElement>('[data-sidebar-hover-reveal-group]');
    const surface = container.querySelector<HTMLElement>('[data-sidebar-hover-content="true"]');
    vi.spyOn(surface as HTMLElement, 'getBoundingClientRect').mockReturnValue({
      x: 6,
      y: 6,
      top: 6,
      right: 330,
      bottom: 700,
      left: 6,
      width: 324,
      height: 694,
      toJSON: () => ({}),
    });

    await act(async () => {
      group?.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, buttons: 0 }));
      group?.dispatchEvent(
        new MouseEvent('pointerout', {
          bubbles: true,
          clientX: 180,
          clientY: 80,
          relatedTarget: outsideTarget,
        })
      );
      outsideTarget.dispatchEvent(
        new MouseEvent('pointerover', { bubbles: true, clientX: 180, clientY: 80 })
      );
    });

    expect(group?.dataset.sidebarHoverRevealState).toBe('open');

    await act(async () => {
      outsideTarget.dispatchEvent(
        new MouseEvent('pointerover', { bubbles: true, clientX: 500, clientY: 80 })
      );
    });

    expect(group?.dataset.sidebarHoverRevealState).toBe('closed');

    await act(async () => {
      root.unmount();
    });
  });

  it('stays open when focus and pointer move into a scoped sidebar portal', async () => {
    const container = document.createElement('div');
    const portal = document.createElement('div');
    portal.dataset.uiPortalScope = 'sidebar';
    document.body.append(container, portal);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(
          SidebarHoverRevealGroup,
          { enabled: true },
          React.createElement('button', { type: 'button' }, 'Repository')
        )
      );
    });

    const group = container.querySelector<HTMLElement>('[data-sidebar-hover-reveal-group]');
    await act(async () => {
      group?.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, buttons: 0 }));
      group?.dispatchEvent(new MouseEvent('pointerout', { bubbles: true, relatedTarget: portal }));
      portal.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    });

    expect(group?.dataset.sidebarHoverRevealState).toBe('open');

    await act(async () => {
      root.unmount();
    });
  });

  it('stays open when a sidebar-owned portal dismisses without a next focus target', async () => {
    const container = document.createElement('div');
    const portalHost = document.createElement('div');
    document.body.append(container, portalHost);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(
          SidebarHoverRevealGroup,
          { enabled: true },
          React.createElement('button', { type: 'button' }, 'Repository'),
          createPortal(
            React.createElement('div', {
              'data-testid': 'sidebar-portal-content',
              'data-ui-portal-scope': 'sidebar',
              tabIndex: -1,
            }),
            portalHost
          )
        )
      );
    });

    const group = container.querySelector<HTMLElement>('[data-sidebar-hover-reveal-group]');
    const portalContent = portalHost.querySelector<HTMLElement>(
      '[data-testid="sidebar-portal-content"]'
    );
    await act(async () => {
      group?.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, buttons: 0 }));
      portalContent?.dispatchEvent(
        new FocusEvent('focusout', { bubbles: true, relatedTarget: null })
      );
    });

    expect(group?.dataset.sidebarHoverRevealState).toBe('open');

    await act(async () => {
      root.unmount();
    });
  });

  it('closes when focus moves from a sidebar-owned portal to an external control', async () => {
    const container = document.createElement('div');
    const portalHost = document.createElement('div');
    const externalButton = document.createElement('button');
    document.body.append(container, portalHost, externalButton);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(
          SidebarHoverRevealGroup,
          { enabled: true },
          React.createElement('button', { type: 'button' }, 'Repository'),
          createPortal(
            React.createElement('div', {
              'data-testid': 'sidebar-portal-content',
              'data-ui-portal-scope': 'sidebar',
              tabIndex: -1,
            }),
            portalHost
          )
        )
      );
    });

    const group = container.querySelector<HTMLElement>('[data-sidebar-hover-reveal-group]');
    const portalContent = portalHost.querySelector<HTMLElement>(
      '[data-testid="sidebar-portal-content"]'
    );
    await act(async () => {
      group?.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, buttons: 0 }));
      portalContent?.dispatchEvent(
        new FocusEvent('focusout', { bubbles: true, relatedTarget: externalButton })
      );
    });

    expect(group?.dataset.sidebarHoverRevealState).toBe('closed');

    await act(async () => {
      root.unmount();
    });
  });
});
