/* @vitest-environment jsdom */

import type {
  AppResourceSnapshot,
  ProjectTokenUsageSnapshot,
  ProjectTokenUsageUpdatedEvent,
} from '@shared/types';
import React, { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TokenUsageDrawer } from '../TokenUsageDrawer';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const tokenSnapshot: ProjectTokenUsageSnapshot = {
  generatedAt: 1,
  providerStatuses: [],
  projects: [],
};

const translate = (value: string) => value;

const resourceSnapshot: AppResourceSnapshot = {
  capturedAt: 1,
  runtime: {
    capturedAt: 1,
    processCount: 0,
    rendererProcessId: null,
    rendererMemory: null,
    rendererMetric: null,
    browserMetric: null,
    gpuMetric: null,
    totalAppWorkingSetSizeKb: 0,
    totalAppPrivateBytesKb: 0,
  },
  resources: [
    {
      id: 'session:agent-1',
      kind: 'session',
      group: 'sessions',
      status: 'running',
      availableActions: [],
      sessionId: 'agent-1',
      sessionKind: 'agent',
      backend: 'local',
      cwd: '/repo/session-worktree',
      createdAt: 1,
      persistOnDisconnect: false,
      pid: 1,
      isActive: true,
      isAlive: true,
      reclaimable: false,
    },
  ],
};

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: translate,
  }),
}));

vi.mock('@/components/ui/sheet', () => ({
  SheetDescription: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) =>
    React.createElement('div', props, children),
  SheetHeader: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) =>
    React.createElement('div', props, children),
  SheetPanel: ({
    children,
    scrollFade: _scrollFade,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode; scrollFade?: boolean }) =>
    React.createElement('div', props, children),
  SheetPopup: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) =>
    React.createElement('div', props, children),
  SheetTitle: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) =>
    React.createElement('div', props, children),
}));

vi.mock('../ProjectTokenUsageSummary', () => ({
  ProjectTokenUsageSummary: ({
    errorMessage,
    loading,
    snapshot,
  }: {
    errorMessage: string | null;
    loading: boolean;
    snapshot: ProjectTokenUsageSnapshot | null;
  }) =>
    React.createElement('div', {
      'data-error-message': errorMessage ?? '',
      'data-loading': String(loading),
      'data-project-count': String(snapshot?.projects.length ?? 0),
    }),
}));

function mountDrawer(open: boolean) {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const root: Root = createRoot(container);

  act(() => {
    root.render(createElement(TokenUsageDrawer, { open }));
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

function installElectronApi(options: {
  getResourceSnapshot: () => Promise<AppResourceSnapshot>;
  getProjectUsage: () => Promise<ProjectTokenUsageSnapshot>;
  onProjectUsageUpdated?: (callback: (event: ProjectTokenUsageUpdatedEvent) => void) => () => void;
}) {
  const onProjectUsageUpdated = options.onProjectUsageUpdated ?? vi.fn(() => () => undefined);

  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      app: {
        getResourceSnapshot: options.getResourceSnapshot,
      },
      tokenUsage: {
        getProjectUsage: options.getProjectUsage,
        onProjectUsageUpdated,
      },
    },
  });
}

describe('TokenUsageDrawer', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('loads token usage independently from registered projects and active session paths', async () => {
    const getResourceSnapshot = vi.fn().mockResolvedValue(resourceSnapshot);
    const getProjectUsage = vi.fn().mockResolvedValue(tokenSnapshot);

    installElectronApi({ getResourceSnapshot, getProjectUsage });

    localStorage.setItem('enso-repositories', JSON.stringify([{ path: '/repo/app' }]));

    const view = mountDrawer(true);

    try {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(getResourceSnapshot).toHaveBeenCalledTimes(1);
      expect(getProjectUsage).toHaveBeenCalledWith({
        projectPaths: ['/repo/app', '/repo/session-worktree'],
      });
      expect(
        view.container.querySelector('[data-project-count]')?.getAttribute('data-project-count')
      ).toBe('0');
      expect(view.container.textContent).toContain('Refresh');
      expect(
        view.container
          .querySelector('button[aria-label="Refresh token usage"]')
          ?.hasAttribute('disabled')
      ).toBe(false);
    } finally {
      view.unmount();
    }
  });

  it('forces a fresh token usage request from the refresh action', async () => {
    const getResourceSnapshot = vi.fn().mockResolvedValue(resourceSnapshot);
    const getProjectUsage = vi.fn().mockResolvedValue(tokenSnapshot);

    installElectronApi({ getResourceSnapshot, getProjectUsage });

    localStorage.setItem('enso-repositories', JSON.stringify([{ path: '/repo/app' }]));

    const view = mountDrawer(true);

    try {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      const refreshButton = view.container.querySelector<HTMLButtonElement>(
        'button[aria-label="Refresh token usage"]'
      );
      expect(refreshButton).not.toBeNull();

      await act(async () => {
        refreshButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(getProjectUsage).toHaveBeenLastCalledWith({
        projectPaths: ['/repo/app', '/repo/session-worktree'],
        forceRefresh: true,
      });
    } finally {
      view.unmount();
    }
  });

  it('uses compact scoped copy in the drawer header', async () => {
    const getResourceSnapshot = vi.fn().mockResolvedValue(resourceSnapshot);
    const getProjectUsage = vi.fn().mockResolvedValue(tokenSnapshot);

    installElectronApi({ getResourceSnapshot, getProjectUsage });

    const view = mountDrawer(true);

    try {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(view.container.textContent).toContain('Project Scope');
      expect(view.container.textContent).toContain('Token Analytics');
      expect(view.container.textContent).toContain(
        'Break down input, output, cache, and reasoning tokens by project and provider.'
      );
      expect(view.container.textContent).not.toContain('Usage Analytics');
      expect(view.container.textContent).not.toContain(
        'Review project token usage across tracked providers.'
      );
    } finally {
      view.unmount();
    }
  });

  it('shows initial loading in the drawer body before rendering the summary panel', async () => {
    const getResourceSnapshot = vi.fn().mockResolvedValue(resourceSnapshot);
    const getProjectUsage = vi.fn(() => new Promise<ProjectTokenUsageSnapshot>(() => {}));

    installElectronApi({ getResourceSnapshot, getProjectUsage });

    const view = mountDrawer(true);

    try {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(view.container.textContent).toContain('Scanning token usage...');
      expect(view.container.textContent).toContain('Refreshing');
      expect(
        view.container
          .querySelector('button[aria-label="Refreshing token usage"]')
          ?.hasAttribute('disabled')
      ).toBe(true);
      expect(view.container.querySelector('[data-slot="skeleton"]')).not.toBeNull();
      expect(view.container.querySelector('[data-project-count]')).toBeNull();
    } finally {
      view.unmount();
    }
  });
});
