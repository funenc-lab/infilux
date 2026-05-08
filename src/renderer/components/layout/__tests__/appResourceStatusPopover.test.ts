/* @vitest-environment jsdom */

import React, { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppResourceStatusPopover } from '../AppResourceStatusPopover';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('lucide-react', () => ({
  Gauge: (props: Record<string, unknown>) => React.createElement('svg', props),
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string) => value,
  }),
}));

vi.mock('@/hooks/useWindowFocus', () => ({
  useWindowFocus: () => ({
    isWindowFocused: true,
    isIdle: false,
  }),
}));

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  SheetTrigger: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) =>
    React.createElement('button', { type: 'button', ...props }, children),
}));

vi.mock('../AppResourceManagerDrawer', () => ({
  AppResourceManagerDrawer: ({ open }: { open: boolean }) =>
    React.createElement('div', { 'data-drawer-open': String(open) }),
}));

function mountPopover() {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const root: Root = createRoot(container);
  act(() => {
    root.render(createElement(AppResourceStatusPopover, { className: 'toolbar-button' }));
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

describe('AppResourceStatusPopover', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('hydrates the top-level trigger with the aggregated runtime tone', async () => {
    const getResourceSnapshot = vi.fn().mockResolvedValue({
      capturedAt: 100,
      runtime: {
        capturedAt: 100,
        processCount: 2,
        rendererProcessId: 303,
        rendererMemory: null,
        rendererMetric: null,
        browserMetric: null,
        gpuMetric: null,
        totalAppWorkingSetSizeKb: 12288,
        totalAppPrivateBytesKb: 6144,
      },
      resources: [
        {
          id: 'session:stale-terminal',
          kind: 'session',
          group: 'sessions',
          status: 'stopped',
          sessionId: 'stale-terminal',
          sessionKind: 'terminal',
          backend: 'local',
          cwd: '/repo/stale',
          createdAt: 10,
          persistOnDisconnect: false,
          pid: 4001,
          isActive: false,
          isAlive: false,
          reclaimable: true,
          runtimeState: 'dead',
          availableActions: [],
        },
      ],
    });

    vi.stubGlobal('window', {
      electronAPI: {
        app: {
          getResourceSnapshot,
        },
      },
    });

    const view = mountPopover();

    try {
      await act(async () => {
        await Promise.resolve();
      });

      const trigger = view.container.querySelector('button');
      const badge = view.container.querySelector('.control-badge');

      expect(getResourceSnapshot).toHaveBeenCalledTimes(1);
      expect(trigger?.getAttribute('data-runtime-tone')).toBe('destructive');
      expect(badge?.className).toContain('control-badge-destructive');
      expect(badge?.textContent).toBe('1');
    } finally {
      view.unmount();
    }
  });

  it('does not keep polling while the drawer stays closed', async () => {
    const getResourceSnapshot = vi.fn().mockResolvedValue({
      capturedAt: 100,
      runtime: {
        capturedAt: 100,
        processCount: 1,
        rendererProcessId: 303,
        rendererMemory: null,
        rendererMetric: null,
        browserMetric: null,
        gpuMetric: null,
        totalAppWorkingSetSizeKb: 4096,
        totalAppPrivateBytesKb: 2048,
      },
      resources: [],
    });

    vi.stubGlobal('window', {
      electronAPI: {
        app: {
          getResourceSnapshot,
        },
      },
    });

    const view = mountPopover();

    try {
      await act(async () => {
        await Promise.resolve();
      });

      expect(getResourceSnapshot).toHaveBeenCalledTimes(1);

      await act(async () => {
        vi.advanceTimersByTime(10_000);
      });

      expect(getResourceSnapshot).toHaveBeenCalledTimes(1);
    } finally {
      view.unmount();
    }
  });
});
