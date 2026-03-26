import { Terminal } from 'lucide-react';
import { useCallback, useRef } from 'react';
import { useDraggable } from '@/hooks/useDraggable';
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
  const buttonPosition = useSettingsStore((s) => s.quickTerminal.buttonPosition);
  const setButtonPosition = useSettingsStore((s) => s.setQuickTerminalButtonPosition);

  const BUTTON_SIZE = 44;

  // 计算容器边界（相对于 viewport）
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

  // 使用 useRef 缓存默认位置
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
    // 如果发生了拖动，不触发点击
    if (hasDragged) {
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    onClick();
  };

  return (
    <button
      aria-label="Quick Terminal"
      aria-pressed={isOpen}
      type="button"
      onClick={handleClick}
      {...dragHandlers}
      className={cn(
        'control-floating-button fixed z-30 flex items-center justify-center rounded-full',
        'pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11',
        // 拖动时状态
        isDragging && 'cursor-grabbing opacity-70 scale-95',
        !isDragging && 'cursor-grab transition-all duration-200', // 只在非拖动时启用过渡
        // 根据状态设置背景和文字颜色
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
      title="Quick Terminal (Ctrl+`)"
    >
      <Terminal className="h-4 w-4" />
    </button>
  );
}
