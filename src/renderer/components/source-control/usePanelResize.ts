import { useCallback, useEffect, useRef, useState } from 'react';
import { PANEL_DEFAULT_WIDTH, PANEL_MAX_WIDTH, PANEL_MIN_WIDTH } from './constants';

interface UsePanelResizeOptions {
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
}

export function usePanelResize(options: UsePanelResizeOptions = {}) {
  const {
    defaultWidth = PANEL_DEFAULT_WIDTH,
    minWidth = PANEL_MIN_WIDTH,
    maxWidth = PANEL_MAX_WIDTH,
  } = options;

  const [width, setWidth] = useState(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;
      setWidth(Math.min(maxWidth, Math.max(minWidth, newWidth)));
    },
    [isResizing, minWidth, maxWidth]
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }

    return undefined;
  }, [isResizing, handleMouseMove, handleMouseUp]);

  return {
    width,
    isResizing,
    containerRef,
    handleMouseDown,
  };
}
