/* @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SidebarFloatingMenuPortal } from '../SidebarFloatingMenuPortal';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const sidebarMenuSourceFiles = [
  '../RepositorySidebar.tsx',
  '../TreeSidebar.tsx',
  '../tree-sidebar/WorktreeTreeItem.tsx',
  '../worktree-panel/WorktreeItem.tsx',
] as const;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('SidebarFloatingMenuPortal', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;
    document.body.innerHTML = '';
  });

  it('renders commands outside a transformed and clipped floating sidebar host', () => {
    const onCommand = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        React.createElement(
          'div',
          {
            'data-floating-sidebar-host': 'true',
            style: { overflow: 'hidden', transform: 'translate3d(0, 0, 0)' },
          },
          React.createElement(
            SidebarFloatingMenuPortal,
            undefined,
            React.createElement(
              'button',
              { 'data-sidebar-menu-command': 'true', onClick: onCommand, type: 'button' },
              'Menu command'
            )
          )
        )
      );
    });

    const host = container.querySelector('[data-floating-sidebar-host="true"]');
    const command = document.querySelector<HTMLButtonElement>('[data-sidebar-menu-command="true"]');

    expect(command).not.toBeNull();
    expect(host?.contains(command ?? null)).toBe(false);
    expect(command?.closest('[data-sidebar-floating-menu-portal="true"]')).not.toBeNull();

    act(() => {
      command?.click();
    });

    expect(onCommand).toHaveBeenCalledTimes(1);
  });

  it('uses the portal for every project and worktree sidebar menu', () => {
    for (const sourceFile of sidebarMenuSourceFiles) {
      const source = readFileSync(resolve(currentDirectory, sourceFile), 'utf8');
      expect(source).toContain('SidebarFloatingMenuPortal');
    }
  });
});
