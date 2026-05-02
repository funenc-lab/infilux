/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppKeyboardShortcuts } from '../useAppKeyboardShortcuts';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const settingsState = {
  mainTabKeybindings: {
    switchToAgent: { key: '1', meta: true },
    switchToFile: { key: '2', meta: true },
    switchToTerminal: { key: '3', meta: true },
    switchToSourceControl: { key: '4', meta: true },
  },
  workspaceKeybindings: {
    toggleWorktree: { key: 'w', meta: true },
    toggleRepository: { key: 'r', meta: true },
    switchActiveWorktree: { key: 'j', meta: true },
  },
};

vi.mock('@/stores/settings', () => ({
  useSettingsStore: {
    getState: () => settingsState,
  },
}));

function HookHarness() {
  useAppKeyboardShortcuts({
    activeWorktreePath: '/repo/worktree',
    onActionPanelToggle: vi.fn(),
    onSwitchActiveWorktree: vi.fn(),
    onTabSwitch: vi.fn(),
    onToggleRepository: vi.fn(),
    onToggleWorktree: vi.fn(),
  });

  return null;
}

describe('useAppKeyboardShortcuts', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it('ignores keyboard events whose target is not an element', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    act(() => {
      root.render(React.createElement(HookHarness));
    });

    expect(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    }).not.toThrow();
    expect(consoleError).not.toHaveBeenCalled();
  });
});
