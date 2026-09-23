/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalSessionRecoverySettings } from '../LocalSessionRecoverySettings';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const setAgentIntegration = vi.fn();
const tmuxCheck = vi.fn();

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string) => value,
  }),
}));

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => ({
    agentIntegration: {
      tmuxEnabled: false,
    },
    setAgentIntegration,
  }),
}));

function installElectronApi(platform: 'darwin' | 'win32' = 'darwin') {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      env: { platform },
      tmux: { check: tmuxCheck },
    },
  });
}

function mountSettings(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(React.createElement(LocalSessionRecoverySettings, { repoPath: '/repo/current' }));
  });

  return { container, root };
}

describe('LocalSessionRecoverySettings', () => {
  beforeEach(() => {
    installElectronApi();
    tmuxCheck.mockResolvedValue({ installed: true });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('enables local session recovery only after tmux is available', async () => {
    const { container, root } = mountSettings();
    const toggle = container.querySelector<HTMLElement>('[role="switch"]');

    expect(container.textContent).toContain('Local session recovery');
    expect(container.textContent).toContain(
      'New sessions created after enabling recovery can restore'
    );
    expect(toggle).not.toBeNull();

    await act(async () => {
      toggle?.click();
      await Promise.resolve();
    });

    expect(tmuxCheck).toHaveBeenCalledWith('/repo/current', true);
    expect(setAgentIntegration).toHaveBeenCalledWith({ tmuxEnabled: true });

    act(() => {
      root.unmount();
    });
  });

  it('keeps recovery disabled and explains the dependency when tmux is unavailable', async () => {
    tmuxCheck.mockResolvedValue({ installed: false });
    const { container, root } = mountSettings();
    const toggle = container.querySelector<HTMLElement>('[role="switch"]');

    await act(async () => {
      toggle?.click();
      await Promise.resolve();
    });

    expect(setAgentIntegration).not.toHaveBeenCalled();
    expect(container.textContent).toContain('tmux is not installed. Please install tmux first.');

    act(() => {
      root.unmount();
    });
  });
});
