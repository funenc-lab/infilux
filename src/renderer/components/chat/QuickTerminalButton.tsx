import { Terminal } from 'lucide-react';
import { useCallback, useRef } from 'react';
import { useDraggable } from '@/hooks/useDraggable';
import { useI18n } from '@/i18n';
import { quickTerminalI18nKeys } from '@/lib/uiTranslationKeys';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';

interface QuickTerminalButtonProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  isOpen: boolean;
  hasRunningProcess: boolean;
  onClick: () => void;
}

export function QuickTerminalButton({
  containerRef,
  isOpen,
  hasRunningProcess,
  onClick,
}: QuickTerminalButtonProps) {
  const { t } = useI18n();
  const buttonPosition = useSettingsStore((s) => s.quickTerminal.buttonPosition);
  const setButtonPosition = useSettingsStore((s) => s.setQuickTerminalButtonPosition);

  const BUTTON_SIZE = 44;

  // Calculate container bounds relative to the viewport.
  const getContainerBounds = useCallback(() => {
    if (!containerRef.current) {
      return {
        left: 0,
        top: 0,
        width: window.innerWidth,
        height: window.innerHeight,
      };
    }
    const rect = containerRef.current.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
  }, [containerRef]);

  // Cache the default position.
  const defaultPositionRef = useRef<{ x: number; y: number } | null>(null);

  if (!defaultPositionRef.current) {
    const bounds = getContainerBounds();
    defaultPositionRef.current = {
      x: bounds.left + bounds.width - BUTTON_SIZE - 16,
      y: bounds.top + bounds.height - BUTTON_SIZE - 16,
    };
  }

  const containerBounds = getContainerBounds();

  const { position, isDragging, hasDragged, dragHandlers } = useDraggable({
    initialPosition: buttonPosition || defaultPositionRef.current,
    bounds: { width: BUTTON_SIZE, height: BUTTON_SIZE },
    containerBounds: {
      width: containerBounds.width,
      height: containerBounds.height,
      left: containerBounds.left,
      top: containerBounds.top,
    },
    onPositionChange: setButtonPosition,
  });

  const handleClick = (e: React.MouseEvent) => {
    // Do not trigger click behavior after a drag gesture.
    if (hasDragged) {
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    onClick();
  };

  return (
    <button
      aria-label={t(quickTerminalI18nKeys.buttonLabel)}
      aria-pressed={isOpen}
      type="button"
      onClick={handleClick}
      {...dragHandlers}
      className={cn(
        'control-floating-button fixed z-30 flex items-center justify-center rounded-full',
        'pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11',
        // Dragging state.
        isDragging && 'cursor-grabbing opacity-70 scale-95',
        !isDragging && 'cursor-grab transition-all duration-200', // Only animate when not dragging.
        // Adjust background and foreground colors by state.
        isOpen
          ? 'border-primary/34 bg-primary/16 text-primary'
          : hasRunningProcess
            ? 'border-support/34 bg-support/14 text-support hover:bg-support/18'
            : 'text-muted-foreground hover:border-border hover:bg-accent/20 hover:text-foreground'
      )}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${BUTTON_SIZE}px`,
        height: `${BUTTON_SIZE}px`,
      }}
      title={t(quickTerminalI18nKeys.shortcutTitle)}
    >
      <Terminal className="h-4 w-4" />
    </button>
  );
}
