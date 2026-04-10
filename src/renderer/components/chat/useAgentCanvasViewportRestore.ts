import type { MutableRefObject, RefObject } from 'react';
import { useEffect } from 'react';
import { resolveAgentCanvasRestoreScrollPosition } from './agentCanvasViewport';

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

interface UseAgentCanvasViewportRestoreOptions {
  applyCanvasViewportPosition: (
    viewport: HTMLDivElement,
    position: CanvasViewportPosition
  ) => CanvasViewportPosition;
  canvasViewportPositionByWorktreeRef: MutableRefObject<Record<string, CanvasViewportPosition>>;
  canvasViewportRestoreReadyWorktreeKeyRef: MutableRefObject<string | null>;
  canvasViewportSnapshotByWorktreeRef: MutableRefObject<Record<string, CanvasViewportSnapshot>>;
  canvasZoomStorageKey: string;
  isActive: boolean;
  isCanvasDisplayMode: boolean;
  readCanvasViewportSnapshot: (viewport: HTMLDivElement) => CanvasViewportSnapshot;
  viewportRef: RefObject<HTMLDivElement | null>;
}

export function useAgentCanvasViewportRestore({
  applyCanvasViewportPosition,
  canvasViewportPositionByWorktreeRef,
  canvasViewportRestoreReadyWorktreeKeyRef,
  canvasViewportSnapshotByWorktreeRef,
  canvasZoomStorageKey,
  isActive,
  isCanvasDisplayMode,
  readCanvasViewportSnapshot,
  viewportRef,
}: UseAgentCanvasViewportRestoreOptions) {
  useEffect(() => {
    if (!isCanvasDisplayMode || !isActive) {
      return;
    }

    let cancelled = false;
    const frameId = requestAnimationFrame(() => {
      if (cancelled) {
        return;
      }

      const viewport = viewportRef.current;
      if (!viewport) {
        return;
      }

      const snapshot = readCanvasViewportSnapshot(viewport);
      const savedPosition = canvasViewportPositionByWorktreeRef.current[canvasZoomStorageKey];
      const nextPosition = resolveAgentCanvasRestoreScrollPosition({
        clientHeight: snapshot.clientHeight,
        clientWidth: snapshot.clientWidth,
        savedPosition,
        scrollHeight: snapshot.scrollHeight,
        scrollWidth: snapshot.scrollWidth,
      });

      applyCanvasViewportPosition(viewport, nextPosition);
      canvasViewportSnapshotByWorktreeRef.current[canvasZoomStorageKey] = snapshot;
      canvasViewportRestoreReadyWorktreeKeyRef.current = canvasZoomStorageKey;
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, [
    applyCanvasViewportPosition,
    canvasViewportPositionByWorktreeRef,
    canvasViewportRestoreReadyWorktreeKeyRef,
    canvasViewportSnapshotByWorktreeRef,
    canvasZoomStorageKey,
    isActive,
    isCanvasDisplayMode,
    readCanvasViewportSnapshot,
    viewportRef,
  ]);
}
