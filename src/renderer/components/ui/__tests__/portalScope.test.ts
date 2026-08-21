/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { Dialog, DialogPopup } from '../dialog';
import { Menu, MenuItem, MenuPopup, MenuTrigger } from '../menu';
import { PortalScopeProvider } from '../portal-scope';
import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from '../tooltip';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('overlay portal scope', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('marks the complete menu portal boundary with its interaction scope', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(
          Menu,
          { open: true },
          React.createElement(MenuTrigger, {
            render: React.createElement('button', { type: 'button' }, 'Actions'),
          }),
          React.createElement(
            MenuPopup,
            { portalScope: 'sidebar' },
            React.createElement(MenuItem, null, 'Refresh')
          )
        )
      );
    });

    const scopedElements = document.querySelectorAll('[data-ui-portal-scope="sidebar"]');
    expect(scopedElements.length).toBeGreaterThanOrEqual(2);
    expect(document.querySelector('[data-slot="menu-backdrop"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="menu-positioner"]')?.closest('body')).not.toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('can omit the menu backdrop for non-modal toolbar menus', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(
          Menu,
          { open: true, modal: false },
          React.createElement(MenuTrigger, {
            render: React.createElement('button', { type: 'button' }, 'Actions'),
          }),
          React.createElement(
            MenuPopup,
            { portalScope: 'sidebar', withBackdrop: false },
            React.createElement(MenuItem, null, 'Refresh')
          )
        )
      );
    });

    expect(document.querySelector('[data-slot="menu-backdrop"]')).toBeNull();
    expect(document.querySelector('[data-slot="menu-positioner"]')).not.toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('inherits portal scope from the nearest interaction boundary', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(
          PortalScopeProvider,
          { scope: 'sidebar' },
          React.createElement(
            Menu,
            { open: true },
            React.createElement(MenuTrigger, {
              render: React.createElement('button', { type: 'button' }, 'Actions'),
            }),
            React.createElement(MenuPopup, null, React.createElement(MenuItem, null, 'Refresh'))
          )
        )
      );
    });

    expect(document.querySelectorAll('[data-ui-portal-scope="sidebar"]')).toHaveLength(2);

    await act(async () => {
      root.unmount();
    });
  });

  it('marks the dialog backdrop and viewport with its interaction scope', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(
          Dialog,
          { open: true },
          React.createElement(
            DialogPopup,
            { portalScope: 'sidebar', showCloseButton: false },
            React.createElement('div', null, 'Running projects')
          )
        )
      );
    });

    expect(
      document.querySelector('[data-slot="dialog-backdrop"]')?.getAttribute('data-ui-portal-scope')
    ).toBe('sidebar');
    expect(
      document.querySelector('[data-slot="dialog-viewport"]')?.getAttribute('data-ui-portal-scope')
    ).toBe('sidebar');

    await act(async () => {
      root.unmount();
    });
  });

  it('marks the tooltip positioner with its interaction scope', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(
          TooltipProvider,
          null,
          React.createElement(
            Tooltip,
            { open: true },
            React.createElement(TooltipTrigger, {
              render: React.createElement('button', { type: 'button' }, 'Running projects'),
            }),
            React.createElement(TooltipPopup, { portalScope: 'sidebar' }, 'Running projects')
          )
        )
      );
    });

    expect(
      document
        .querySelector('[data-slot="tooltip-positioner"]')
        ?.getAttribute('data-ui-portal-scope')
    ).toBe('sidebar');

    await act(async () => {
      root.unmount();
    });
  });
});
