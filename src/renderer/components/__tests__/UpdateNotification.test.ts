/* @vitest-environment jsdom */

import type { UpdateStatus } from '@shared/types';
import React, { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UpdateNotification } from '../UpdateNotification';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const updateNotificationTestDoubles = vi.hoisted(() => ({
  getState: vi.fn(),
  onStatus: vi.fn(),
  quitAndInstall: vi.fn(),
  downloadUpdate: vi.fn(),
}));

vi.mock('lucide-react', () => ({
  Download: (props: Record<string, unknown>) => React.createElement('svg', props),
  RefreshCw: (props: Record<string, unknown>) => React.createElement('svg', props),
  XIcon: (props: Record<string, unknown>) => React.createElement('svg', props),
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params
        ? key.replace(/\{\{(\w+)\}\}/g, (match, token) =>
            params[token] === undefined ? match : String(params[token])
          )
        : key,
  }),
}));

vi.mock('../ui/dialog', () => ({
  Dialog: ({ children, open }: { children?: React.ReactNode; open: boolean }) =>
    open ? React.createElement('div', { role: 'dialog' }, children) : null,
  DialogDescription: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('p', null, children),
  DialogFooter: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('footer', null, children),
  DialogHeader: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('header', null, children),
  DialogPopup: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('section', null, children),
  DialogTitle: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('h2', null, children),
}));

function installElectronApi(status: UpdateStatus | null) {
  updateNotificationTestDoubles.getState.mockResolvedValue({
    isSupported: true,
    autoUpdateEnabled: true,
    status,
  });
  updateNotificationTestDoubles.onStatus.mockReturnValue(vi.fn());
  updateNotificationTestDoubles.quitAndInstall.mockResolvedValue(undefined);
  updateNotificationTestDoubles.downloadUpdate.mockResolvedValue(undefined);

  vi.stubGlobal('window', {
    ...window,
    electronAPI: {
      updater: {
        getState: updateNotificationTestDoubles.getState,
        onStatus: updateNotificationTestDoubles.onStatus,
        quitAndInstall: updateNotificationTestDoubles.quitAndInstall,
        downloadUpdate: updateNotificationTestDoubles.downloadUpdate,
      },
    },
  });
}

async function mountUpdateNotification(status: UpdateStatus | null) {
  installElectronApi(status);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(createElement(UpdateNotification, { autoUpdateEnabled: true }));
  });
  await act(async () => {
    await Promise.resolve();
  });

  return {
    container,
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('UpdateNotification', () => {
  beforeEach(() => {
    updateNotificationTestDoubles.getState.mockReset();
    updateNotificationTestDoubles.onStatus.mockReset();
    updateNotificationTestDoubles.quitAndInstall.mockReset();
    updateNotificationTestDoubles.downloadUpdate.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('disables restart while an install restart request is in flight', async () => {
    const view = await mountUpdateNotification({
      status: 'downloaded',
      info: { version: '1.3.0' },
    });
    const button = Array.from(view.container.querySelectorAll('button')).find(
      (candidate) => candidate.textContent === 'Restart now'
    ) as HTMLButtonElement;

    act(() => {
      button.click();
    });

    expect(updateNotificationTestDoubles.quitAndInstall).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);

    view.unmount();
  });
});
