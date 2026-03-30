import { AnimatePresence, motion } from 'framer-motion';
import { LayoutGrid, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/i18n';
import { scaleInVariants, springFast } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { Z_INDEX } from '@/lib/z-index';
import { useSettingsStore } from '@/stores/settings';
import type { SettingsCategory } from './constants';
import { SettingsContent } from './SettingsContent';

interface DraggableSettingsWindowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeCategory?: SettingsCategory;
  onCategoryChange?: (category: SettingsCategory) => void;
  scrollToProvider?: boolean;
  repoPath?: string;
}

export function DraggableSettingsWindow({
  open,
  onOpenChange,
  activeCategory,
  onCategoryChange,
  scrollToProvider,
  repoPath,
}: DraggableSettingsWindowProps) {
  const { t } = useI18n();
  const savedPosition = useSettingsStore((s) => s.settingsModalPosition);
  const setSettingsModalPosition = useSettingsStore((s) => s.setSettingsModalPosition);
  const setSettingsDisplayMode = useSettingsStore((s) => s.setSettingsDisplayMode);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState(savedPosition || { x: 0, y: 0 });
  const dragStartPos = useRef<{ x: number; y: number; lastX?: number; lastY?: number }>({
    x: 0,
    y: 0,
  });
  const windowRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  // Window size caps
  const WINDOW_WIDTH = 896;
  const WINDOW_HEIGHT = 600;
  const frameWidth = Math.min(WINDOW_WIDTH, Math.max(320, viewportSize.width - 24));
  const frameHeight = Math.min(WINDOW_HEIGHT, Math.max(420, viewportSize.height - 24));

  // macOS traffic light safe area keeps the title bar clear.
  const isMac = window.electronAPI.env.platform === 'darwin';
  const MAC_SAFE_MARGIN_X = 0;
  const MAC_SAFE_MARGIN_Y = 50;

  useEffect(() => {
    const handleResize = () => {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Center and clamp the window inside the viewport.
  useEffect(() => {
    if (!open) return;

    const minX = isMac ? MAC_SAFE_MARGIN_X : 0;
    const minY = isMac ? MAC_SAFE_MARGIN_Y : 0;
    const centerX = Math.max(minX, (viewportSize.width - frameWidth) / 2);
    const centerY = Math.max(minY, (viewportSize.height - frameHeight) / 2);

    if (!savedPosition) {
      // Center on first open.
      setPosition({ x: centerX, y: centerY });
    } else {
      const isOutOfBounds =
        savedPosition.x < minX ||
        savedPosition.y < minY ||
        savedPosition.x + frameWidth > viewportSize.width ||
        savedPosition.y + frameHeight > viewportSize.height;

      if (isOutOfBounds) {
        // Reset when the saved position is no longer valid.
        setPosition({ x: centerX, y: centerY });
        setSettingsModalPosition({ x: centerX, y: centerY });
      } else {
        setPosition(savedPosition);
      }
    }
  }, [open, savedPosition, setSettingsModalPosition, isMac, frameHeight, frameWidth, viewportSize]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onOpenChange]);

  // Use direct DOM updates during dragging to avoid repaint lag.
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('.no-drag')) return;
      setIsDragging(true);
      dragStartPos.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      };
    },
    [position]
  );

  useEffect(() => {
    if (!isDragging) return;

    const minX = isMac ? MAC_SAFE_MARGIN_X : 0;
    const minY = isMac ? MAC_SAFE_MARGIN_Y : 0;

    const handleMouseMove = (e: MouseEvent) => {
      let newX = e.clientX - dragStartPos.current.x;
      let newY = e.clientY - dragStartPos.current.y;

      // Keep the frame inside the viewport.
      newX = Math.max(minX, Math.min(newX, viewportSize.width - frameWidth));
      newY = Math.max(minY, Math.min(newY, viewportSize.height - frameHeight));

      if (windowRef.current) {
        windowRef.current.style.left = `${newX}px`;
        windowRef.current.style.top = `${newY}px`;
      }
      dragStartPos.current.lastX = newX;
      dragStartPos.current.lastY = newY;
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      const finalX = dragStartPos.current.lastX ?? position.x;
      const finalY = dragStartPos.current.lastY ?? position.y;
      setPosition({ x: finalX, y: finalY });
      setSettingsModalPosition({ x: finalX, y: finalY });
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    isDragging,
    isMac,
    position.x,
    position.y,
    setSettingsModalPosition,
    frameHeight,
    frameWidth,
    viewportSize.height,
    viewportSize.width,
  ]);

  if (!open) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={windowRef}
          variants={scaleInVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={isDragging ? { duration: 0 } : springFast}
          className="control-floating fixed flex flex-col overflow-hidden rounded-2xl"
          style={
            {
              left: `${position.x}px`,
              top: `${position.y}px`,
              width: `${frameWidth}px`,
              height: `${frameHeight}px`,
              zIndex: Z_INDEX.SETTINGS_WINDOW,
              WebkitAppRegion: 'no-drag',
            } as React.CSSProperties
          }
        >
          <div
            className={cn(
              'flex items-center justify-between gap-3 rounded-t-xl border-b px-4 py-2.5 select-none',
              isDragging ? 'cursor-grabbing' : 'cursor-grab'
            )}
            onMouseDown={handleMouseDown}
          >
            <h2 className="ui-type-panel-title min-w-0 truncate text-lg font-medium">
              {t('Settings')}
            </h2>
            <div className="no-drag flex shrink-0 items-center gap-2">
              <button
                aria-label={t('Switch to TAB mode')}
                type="button"
                onClick={() => setSettingsDisplayMode('tab')}
                className="hidden h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground sm:flex"
                title={t('Switch to TAB mode')}
              >
                <LayoutGrid className="h-3 w-3" />
                {t('Switch to TAB mode')}
              </button>
              <button
                aria-label={t('Close')}
                type="button"
                onClick={() => onOpenChange(false)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-1 min-h-0">
            <SettingsContent
              activeCategory={activeCategory}
              onCategoryChange={onCategoryChange}
              scrollToProvider={scrollToProvider}
              repoPath={repoPath}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
