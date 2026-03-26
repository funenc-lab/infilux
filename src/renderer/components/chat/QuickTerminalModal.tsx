import { Minimize2, Terminal as TerminalIcon, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ShellTerminal } from '@/components/terminal/ShellTerminal';
import { useResizable } from '@/hooks/useResizable';
import { useI18n } from '@/i18n';
import { defaultDarkTheme, getXtermTheme } from '@/lib/ghosttyTheme';
import { matchesKeybinding } from '@/lib/keybinding';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';
import { useTerminalStore } from '@/stores/terminal';

interface QuickTerminalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClose: () => void; // Fully close the modal and dispose the PTY.
  cwd: string;
  backendSessionId?: string;
  onSessionInit: (sessionId: string) => void;
}

export function QuickTerminalModal({
  open,
  onOpenChange,
  onClose,
  cwd,
  backendSessionId,
  onSessionInit,
}: QuickTerminalModalProps) {
  const modalPosition = useSettingsStore((s) => s.quickTerminal.modalPosition);
  const savedModalSize = useSettingsStore((s) => s.quickTerminal.modalSize);
  const setModalPosition = useSettingsStore((s) => s.setQuickTerminalModalPosition);
  const setModalSize = useSettingsStore((s) => s.setQuickTerminalModalSize);
  const xtermKeybindings = useSettingsStore((s) => s.xtermKeybindings);
  const terminalTheme = useSettingsStore((s) => s.terminalTheme);
  const { getAllQuickTerminalCwds } = useTerminalStore();
  const { t } = useI18n();

  const terminalBgColor = useMemo(() => {
    return getXtermTheme(terminalTheme)?.background ?? defaultDarkTheme.background;
  }, [terminalTheme]);

  // Generate a stable id so the terminal mount key does not drift across renders.
  const mountIdRef = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`);

  // Keep activated worktrees mounted so their terminal sessions survive modal minimization.
  const [renderedCwds, setRenderedCwds] = useState<Set<string>>(new Set());

  // Remove the cwd so ShellTerminal can unmount and dispose its PTY cleanly.
  const handleRealClose = useCallback(() => {
    setRenderedCwds((prev) => {
      const updated = new Set(prev);
      updated.delete(cwd);
      return updated;
    });
    onClose();
  }, [cwd, onClose]);

  // Track the active cwd once the modal opens.
  useEffect(() => {
    if (open && !renderedCwds.has(cwd)) {
      setRenderedCwds((prev) => new Set([...prev, cwd]));
    }
  }, [open, cwd, renderedCwds]);

  // Mirror the store so existing sessions remain mounted.
  useEffect(() => {
    const storeCwds = getAllQuickTerminalCwds();
    if (storeCwds.length > 0) {
      setRenderedCwds((prev) => {
        const updated = new Set(prev);
        for (const c of storeCwds) {
          updated.add(c);
        }
        return updated;
      });
    }
  }, [getAllQuickTerminalCwds]);

  // Resolve the initial modal size once from the viewport.
  const defaultSize = useMemo(() => {
    const width = Math.min(Math.max(window.innerWidth * 0.6, 600), 1200);
    const height = Math.min(Math.max(window.innerHeight * 0.35, 300), 600);
    return { width, height };
  }, []);

  // Resolve the initial modal position once from the saved size and viewport.
  const defaultPositionRef = useRef<{ x: number; y: number } | null>(null);
  if (!defaultPositionRef.current) {
    const size = savedModalSize || defaultSize;
    const left = (window.innerWidth - size.width) / 2;
    const top = window.innerHeight - size.height - 40;
    defaultPositionRef.current = { x: left, y: top };
  }

  const { size, position, setPosition, isResizing, getResizeHandleProps } = useResizable({
    initialSize: savedModalSize || defaultSize,
    initialPosition: modalPosition || defaultPositionRef.current,
    minSize: { width: 400, height: 250 },
    maxSize: { width: window.innerWidth - 40, height: window.innerHeight - 80 },
    onSizeChange: setModalSize,
    onPositionChange: setModalPosition,
  });

  // Drag handling stays local so resizing and moving cannot conflict.
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (isResizing) return;
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      };
    },
    [isResizing, position]
  );

  const handleDragMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || isResizing) return;
      setPosition({
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      });
    },
    [isDragging, isResizing, setPosition]
  );

  const handleDragEnd = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      setModalPosition(position);
    }
  }, [isDragging, position, setModalPosition]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup', handleDragEnd);
      return () => {
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, [isDragging, handleDragMove, handleDragEnd]);

  // Keep the modal close behavior aligned with the terminal tab shortcut.
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onOpenChange(false);
        return;
      }

      if (matchesKeybinding(e, xtermKeybindings.closeTab)) {
        e.preventDefault();
        e.stopPropagation();
        onOpenChange(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [open, onOpenChange, xtermKeybindings.closeTab]);

  const modalRef = useRef<HTMLDivElement>(null);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onOpenChange(false);
    }
  };

  return createPortal(
    // biome-ignore lint/a11y/useKeyWithClickEvents: ESC handling lives in the keyboard effect.
    <div
      onClick={handleBackdropClick}
      data-quick-terminal={open ? 'true' : 'false'}
      className={cn(
        'fixed inset-0 z-50 transition-all',
        open
          ? 'bg-[color:color-mix(in_oklch,var(--background)_56%,transparent)] backdrop-blur-[1px]'
          : 'pointer-events-none opacity-0'
      )}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation is not an interaction. */}
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'control-floating fixed flex flex-col overflow-hidden rounded-xl transition-opacity',
          !open && 'opacity-0'
        )}
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: `${size.width}px`,
          height: `${size.height}px`,
        }}
      >
        <div
          {...getResizeHandleProps('n')}
          className="absolute top-0 left-0 right-0 h-1 cursor-n-resize z-10 hover:bg-primary/30 active:bg-primary/50"
        />
        <div
          {...getResizeHandleProps('s')}
          className="absolute bottom-0 left-0 right-0 h-1 cursor-s-resize z-10 hover:bg-primary/30 active:bg-primary/50"
        />
        <div
          {...getResizeHandleProps('w')}
          className="absolute top-0 bottom-0 left-0 w-1 cursor-w-resize z-10 hover:bg-primary/30 active:bg-primary/50"
        />
        <div
          {...getResizeHandleProps('e')}
          className="absolute top-0 bottom-0 right-0 w-1 cursor-e-resize z-10 hover:bg-primary/30 active:bg-primary/50"
        />
        <div
          {...getResizeHandleProps('nw')}
          className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize z-20"
        />
        <div
          {...getResizeHandleProps('ne')}
          className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize z-20"
        />
        <div
          {...getResizeHandleProps('sw')}
          className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize z-20"
        />
        <div
          {...getResizeHandleProps('se')}
          className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize z-20"
        />

        <div
          onMouseDown={handleDragStart}
          className={cn(
            'control-floating-muted flex h-10 items-center justify-between border-b border-border/70 px-3 select-none',
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          )}
        >
          <div className="flex items-center gap-2 text-sm font-medium pointer-events-none">
            <TerminalIcon className="h-4 w-4" />
            <span>{t('Quick Terminal')}</span>
          </div>
          <div className="flex items-center gap-1 pointer-events-auto">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="control-floating-button h-7 w-7 rounded-lg"
              title={t('Minimize (Esc)')}
              aria-label={t('Minimize quick terminal')}
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={handleRealClose}
              className="control-floating-button h-7 w-7 rounded-lg"
              title={t('Close')}
              aria-label={t('Close quick terminal')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 p-2" style={{ backgroundColor: terminalBgColor }}>
          {Array.from(renderedCwds).map((terminalCwd) => (
            <div
              key={`terminal-${mountIdRef.current}-${terminalCwd}`}
              className={cn('h-full', terminalCwd !== cwd && 'hidden')}
            >
              <ShellTerminal
                cwd={terminalCwd}
                backendSessionId={terminalCwd === cwd ? backendSessionId : undefined}
                isActive={open && terminalCwd === cwd}
                onExit={terminalCwd === cwd ? handleRealClose : undefined}
                onInit={onSessionInit}
                onSessionIdChange={onSessionInit}
              />
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
