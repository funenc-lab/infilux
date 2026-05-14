import type { Terminal } from '@xterm/xterm';
import { useCallback, useEffect, useRef, useState } from 'react';

const SCROLL_THRESHOLD = 5;

function readScrollFromBottom(terminal: Terminal): number {
  const buffer = terminal.buffer.active;
  return Math.max(0, buffer.baseY - buffer.viewportY);
}

function getTerminalDisposables(terminal: Terminal, listener: () => void) {
  return [
    terminal.onScroll(listener),
    terminal.onLineFeed(listener),
    terminal.onWriteParsed(listener),
    terminal.onRender(listener),
    terminal.onResize(listener),
  ];
}

export function useTerminalScrollToBottom(terminal: Terminal | null) {
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const animationFrameRef = useRef<number | null>(null);
  const checkFrameRef = useRef<number | null>(null);

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (checkFrameRef.current) {
        cancelAnimationFrame(checkFrameRef.current);
      }
    };
  }, []);

  // Monitor scroll position to show/hide scroll-to-bottom button
  useEffect(() => {
    if (!terminal) return;

    const checkScrollPosition = () => {
      const scrollFromBottom = readScrollFromBottom(terminal);
      setShowScrollToBottom(scrollFromBottom > SCROLL_THRESHOLD);
    };

    const scheduleScrollPositionCheck = () => {
      if (checkFrameRef.current) {
        cancelAnimationFrame(checkFrameRef.current);
      }
      checkFrameRef.current = requestAnimationFrame(() => {
        checkFrameRef.current = null;
        checkScrollPosition();
      });
    };

    checkScrollPosition();
    scheduleScrollPositionCheck();

    const disposables = getTerminalDisposables(terminal, scheduleScrollPositionCheck);

    return () => {
      if (checkFrameRef.current) {
        cancelAnimationFrame(checkFrameRef.current);
        checkFrameRef.current = null;
      }
      for (const disposable of disposables) {
        disposable.dispose();
      }
    };
  }, [terminal]);

  const handleScrollToBottom = useCallback(() => {
    if (!terminal) return;

    // Cancel any ongoing animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    terminal.clearSelection();
    terminal.scrollToBottom();
    terminal.focus();
    setShowScrollToBottom(false);

    animationFrameRef.current = requestAnimationFrame(() => {
      animationFrameRef.current = null;
      setShowScrollToBottom(readScrollFromBottom(terminal) > SCROLL_THRESHOLD);
    });
  }, [terminal]);

  return { showScrollToBottom, handleScrollToBottom };
}
