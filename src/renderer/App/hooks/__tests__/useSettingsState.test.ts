/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingsDisplayMode } from '@/stores/settings';
import { useSettingsState } from '../useSettingsState';

const settingsStoreState: { settingsDisplayMode: SettingsDisplayMode } = {
  settingsDisplayMode: 'draggable-modal',
};

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/stores/settings', () => ({
  useSettingsStore: (selector: (state: { settingsDisplayMode: SettingsDisplayMode }) => unknown) =>
    selector(settingsStoreState),
}));

let capturedHandleSettingsDialogOpenChange: ((open: boolean) => void) | null = null;
let capturedToggleSettings: (() => void) | null = null;
let capturedSettingsCategory: string | null = null;

function HookHarness({ args }: { args: Parameters<typeof useSettingsState> }) {
  const { handleSettingsDialogOpenChange, toggleSettings, settingsCategory } = useSettingsState(
    ...args
  );
  capturedHandleSettingsDialogOpenChange = handleSettingsDialogOpenChange;
  capturedToggleSettings = toggleSettings;
  capturedSettingsCategory = settingsCategory;
  return React.createElement('div');
}

function mountHookHarness(args: Parameters<typeof useSettingsState>) {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const root: Root = createRoot(container);
  act(() => {
    root.render(React.createElement(HookHarness, { args }));
  });

  return {
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('useSettingsState', () => {
  beforeEach(() => {
    capturedHandleSettingsDialogOpenChange = null;
    capturedToggleSettings = null;
    capturedSettingsCategory = null;
    settingsStoreState.settingsDisplayMode = 'draggable-modal';
    localStorage.clear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('persists the previous tab when closing the draggable settings window', () => {
    const setActiveTab = vi.fn();
    const setPreviousTab = vi.fn();
    const persistCurrentWorktreeTab = vi.fn();

    const mounted = mountHookHarness([
      'settings',
      'terminal',
      setActiveTab,
      setPreviousTab,
      persistCurrentWorktreeTab,
    ]);

    expect(capturedHandleSettingsDialogOpenChange).not.toBeNull();

    act(() => {
      capturedHandleSettingsDialogOpenChange?.(false);
    });

    expect(persistCurrentWorktreeTab).toHaveBeenCalledWith('terminal');
    mounted.unmount();
  });

  it('falls back to chat when no previous tab is available while closing the draggable settings window', () => {
    const setActiveTab = vi.fn();
    const setPreviousTab = vi.fn();
    const persistCurrentWorktreeTab = vi.fn();

    const mounted = mountHookHarness([
      'settings',
      null,
      setActiveTab,
      setPreviousTab,
      persistCurrentWorktreeTab,
    ]);

    expect(capturedHandleSettingsDialogOpenChange).not.toBeNull();

    act(() => {
      capturedHandleSettingsDialogOpenChange?.(false);
    });

    expect(persistCurrentWorktreeTab).toHaveBeenCalledWith('chat');
    mounted.unmount();
  });

  it('persists the active tab when toggling the draggable settings window closed from the toolbar button', () => {
    const setActiveTab = vi.fn();
    const setPreviousTab = vi.fn();
    const persistCurrentWorktreeTab = vi.fn();

    const mounted = mountHookHarness([
      'terminal',
      'chat',
      setActiveTab,
      setPreviousTab,
      persistCurrentWorktreeTab,
    ]);

    expect(capturedToggleSettings).not.toBeNull();

    act(() => {
      capturedToggleSettings?.();
    });
    act(() => {
      capturedToggleSettings?.();
    });

    expect(persistCurrentWorktreeTab).toHaveBeenCalledWith('terminal');
    mounted.unmount();
  });

  it('accepts the dedicated input settings category from persisted local storage', () => {
    localStorage.setItem('enso-settings-active-category', 'input');

    const mounted = mountHookHarness(['chat', null, vi.fn(), vi.fn(), vi.fn()]);

    expect(capturedSettingsCategory).toBe('input');
    mounted.unmount();
  });
});
