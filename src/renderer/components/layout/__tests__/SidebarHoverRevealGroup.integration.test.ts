/* @vitest-environment jsdom */

import React, { act } from 'react';
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
});
