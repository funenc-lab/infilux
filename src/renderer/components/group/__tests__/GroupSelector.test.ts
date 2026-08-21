/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GroupSelector } from '../GroupSelector';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string) => value,
  }),
}));

function dispatchKey(target: Element, key: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }));
}

async function mountGroupSelector() {
  const onSelectGroup = vi.fn();
  const onEditGroup = vi.fn();
  const onAddGroup = vi.fn();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(GroupSelector, {
        groups: [
          { id: 'alpha', name: 'Alpha', emoji: 'A', color: '#336699', order: 0 },
          { id: 'beta', name: 'Beta', emoji: 'B', color: '#993366', order: 1 },
        ],
        activeGroupId: 'alpha',
        repositoryCounts: { alpha: 3, beta: 2 },
        totalCount: 5,
        onSelectGroup,
        onEditGroup,
        onAddGroup,
      })
    );
  });

  return {
    container,
    onSelectGroup,
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('GroupSelector', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('renders separate semantic buttons for selection and editing', async () => {
    const view = await mountGroupSelector();

    try {
      const trigger = view.container.querySelector<HTMLButtonElement>(
        'button[aria-haspopup="menu"]'
      );
      const editButton = view.container.querySelector<HTMLButtonElement>(
        'button[aria-label="Edit Group"]'
      );

      expect(trigger).not.toBeNull();
      expect(editButton).not.toBeNull();
      expect(trigger?.contains(editButton)).toBe(false);
      expect(view.container.querySelector('button button')).toBeNull();
    } finally {
      view.unmount();
    }
  });

  it('keeps the active group trigger focused on scope instead of duplicating repository counts', async () => {
    const view = await mountGroupSelector();

    try {
      const trigger = view.container.querySelector<HTMLButtonElement>(
        'button[aria-haspopup="menu"]'
      );

      expect(trigger?.textContent).toContain('Alpha');
      expect(trigger?.textContent).not.toContain('3');
      expect(trigger?.querySelector('[style*="background-color"]')).toBeNull();
    } finally {
      view.unmount();
    }
  });

  it('supports menu navigation and restores trigger focus after Escape', async () => {
    const view = await mountGroupSelector();

    try {
      const trigger = view.container.querySelector<HTMLButtonElement>(
        'button[aria-haspopup="menu"]'
      );
      expect(trigger).not.toBeNull();

      await act(async () => {
        if (trigger) dispatchKey(trigger, 'ArrowDown');
      });

      const menu = view.container.querySelector<HTMLElement>('[role="menu"]');
      const menuItems = Array.from(
        view.container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
      );
      expect(menu).not.toBeNull();
      expect(document.activeElement).toBe(menuItems[0]);

      await act(async () => {
        if (menu) dispatchKey(menu, 'ArrowDown');
      });
      expect(document.activeElement).toBe(menuItems[1]);

      await act(async () => {
        if (menu) dispatchKey(menu, 'Escape');
      });
      expect(view.container.querySelector('[role="menu"]')).toBeNull();
      expect(document.activeElement).toBe(trigger);
    } finally {
      view.unmount();
    }
  });
});
