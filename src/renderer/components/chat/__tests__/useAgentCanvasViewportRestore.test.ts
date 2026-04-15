/* @vitest-environment jsdom */

import React, { act, useCallback, useMemo, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clampAgentCanvasScrollPosition } from '../agentCanvasViewport';
import { useAgentCanvasViewportRestore } from '../useAgentCanvasViewportRestore';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type CanvasViewportPosition = {
  left: number;
  top: number;
};

type CanvasViewportSnapshot = {
  clientHeight: number;
  clientWidth: number;
  scrollHeight: number;
  scrollWidth: number;
};

function readCanvasViewportSnapshot(viewport: HTMLDivElement): CanvasViewportSnapshot {
  return {
    clientHeight: viewport.clientHeight,
    clientWidth: viewport.clientWidth,
    scrollHeight: viewport.scrollHeight,
    scrollWidth: viewport.scrollWidth,
  };
}

interface HookHarnessProps {
  isActive: boolean;
  isCanvasDisplayMode?: boolean;
  recenterOnActivateToken?: number;
  worktreeKey?: string;
}

function HookHarness({
  isActive,
  isCanvasDisplayMode = true,
  recenterOnActivateToken = 0,
  worktreeKey = '/repo/worktree',
}: HookHarnessProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const savedPositionsRef = useRef<Record<string, CanvasViewportPosition>>({});
  const snapshotByWorktreeRef = useRef<Record<string, CanvasViewportSnapshot>>({});
  const restoreReadyWorktreeKeyRef = useRef<string | null>(null);
  const canvasZoomStorageKey = useMemo(() => worktreeKey, [worktreeKey]);

  const applyCanvasViewportPosition = useCallback(
    (viewport: HTMLDivElement, position: CanvasViewportPosition): CanvasViewportPosition => {
      const snapshot = readCanvasViewportSnapshot(viewport);
      const nextPosition = clampAgentCanvasScrollPosition({
        clientHeight: snapshot.clientHeight,
        clientWidth: snapshot.clientWidth,
        left: position.left,
        scrollHeight: snapshot.scrollHeight,
        scrollWidth: snapshot.scrollWidth,
        top: position.top,
      });

      viewport.scrollLeft = nextPosition.left;
      viewport.scrollTop = nextPosition.top;
      savedPositionsRef.current[canvasZoomStorageKey] = nextPosition;
      return nextPosition;
    },
    [canvasZoomStorageKey]
  );

  useAgentCanvasViewportRestore({
    applyCanvasViewportPosition,
    canvasViewportPositionByWorktreeRef: savedPositionsRef,
    canvasViewportRestoreReadyWorktreeKeyRef: restoreReadyWorktreeKeyRef,
    canvasViewportSnapshotByWorktreeRef: snapshotByWorktreeRef,
    canvasZoomStorageKey,
    isActive,
    isCanvasDisplayMode,
    readCanvasViewportSnapshot,
    viewportRef,
    ...(recenterOnActivateToken > 0 ? { recenterOnActivateToken } : {}),
  });

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (restoreReadyWorktreeKeyRef.current !== canvasZoomStorageKey) {
        return;
      }

      savedPositionsRef.current[canvasZoomStorageKey] = {
        left: event.currentTarget.scrollLeft,
        top: event.currentTarget.scrollTop,
      };
    },
    [canvasZoomStorageKey]
  );

  return React.createElement('div', {
    'data-testid': 'viewport',
    onScroll: handleScroll,
    ref: viewportRef,
  });
}

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('useAgentCanvasViewportRestore', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;
  let rafQueue: Array<{ callback: FrameRequestCallback; id: number }> = [];
  let nextRafId = 1;

  beforeEach(() => {
    rafQueue = [];
    nextRafId = 1;

    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = nextRafId++;
      rafQueue.push({ callback, id });
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      rafQueue = rafQueue.filter((entry) => entry.id !== id);
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root && container) {
      const mountedRoot = root;
      await act(async () => {
        mountedRoot.unmount();
      });
      container.remove();
    }

    root = null;
    container = null;
    vi.unstubAllGlobals();
  });

  async function flushAnimationFrames() {
    await act(async () => {
      while (rafQueue.length > 0) {
        const pending = [...rafQueue];
        rafQueue = [];
        for (const entry of pending) {
          entry.callback(0);
        }
      }
    });
  }

  function mockViewportMetrics(viewport: HTMLDivElement) {
    Object.defineProperties(viewport, {
      clientHeight: {
        configurable: true,
        get: () => 180,
      },
      clientWidth: {
        configurable: true,
        get: () => 220,
      },
      scrollHeight: {
        configurable: true,
        get: () => 920,
      },
      scrollWidth: {
        configurable: true,
        get: () => 960,
      },
    });
  }

  async function renderHarness(props: HookHarnessProps) {
    await act(async () => {
      root?.render(React.createElement(HookHarness, props));
    });
  }

  it('restores the saved viewport position when the kept-mounted canvas becomes active again', async () => {
    await renderHarness({ isActive: true });

    const viewport = container?.querySelector('[data-testid="viewport"]') as HTMLDivElement | null;
    expect(viewport).not.toBeNull();
    if (!viewport) {
      return;
    }

    mockViewportMetrics(viewport);
    await flushAnimationFrames();

    expect(viewport.scrollLeft).toBe(370);
    expect(viewport.scrollTop).toBe(370);

    viewport.scrollLeft = 640;
    viewport.scrollTop = 700;
    await act(async () => {
      viewport.dispatchEvent(new Event('scroll'));
    });

    await renderHarness({ isActive: false });

    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;

    await renderHarness({ isActive: true });
    await flushAnimationFrames();

    expect(viewport.scrollLeft).toBe(640);
    expect(viewport.scrollTop).toBe(700);
  });

  it('does not restore the viewport while the canvas stays inactive', async () => {
    await renderHarness({ isActive: false });

    const viewport = container?.querySelector('[data-testid="viewport"]') as HTMLDivElement | null;
    expect(viewport).not.toBeNull();
    if (!viewport) {
      return;
    }

    mockViewportMetrics(viewport);
    await flushAnimationFrames();

    expect(viewport.scrollLeft).toBe(0);
    expect(viewport.scrollTop).toBe(0);
  });

  it('recenters the viewport when a worktree switch token arrives before the kept-mounted canvas becomes active', async () => {
    await renderHarness({ isActive: true });

    const viewport = container?.querySelector('[data-testid="viewport"]') as HTMLDivElement | null;
    expect(viewport).not.toBeNull();
    if (!viewport) {
      return;
    }

    mockViewportMetrics(viewport);
    await flushAnimationFrames();

    viewport.scrollLeft = 640;
    viewport.scrollTop = 700;
    await act(async () => {
      viewport.dispatchEvent(new Event('scroll'));
    });

    await renderHarness({ isActive: false });

    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;

    await renderHarness({ isActive: true, recenterOnActivateToken: 1 });
    await flushAnimationFrames();

    expect(viewport.scrollLeft).toBe(370);
    expect(viewport.scrollTop).toBe(370);
  });
});
