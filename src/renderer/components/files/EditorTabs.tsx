import { getDisplayPath } from '@shared/utils/path';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Menu, MenuItem, MenuPopup, MenuSeparator } from '@/components/ui/menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toastManager } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { buildClipboardToastCopy } from '@/lib/feedbackCopy';
import { springFast } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { EditorTab } from '@/stores/editor';
import { getFileIcon, getFileIconColor } from './fileIcons';

interface EditorTabsProps {
  tabs: EditorTab[];
  activeTabPath: string | null;
  onTabClick: (path: string) => void;
  onTabClose: (path: string, e: React.MouseEvent) => void | Promise<void>;
  onClose?: (path: string) => void | Promise<void>;
  onCloseOthers?: (keepPath: string) => void | Promise<void>;
  onCloseAll?: () => void | Promise<void>;
  onCloseLeft?: (path: string) => void | Promise<void>;
  onCloseRight?: (path: string) => void | Promise<void>;
  onTabReorder?: (fromIndex: number, toIndex: number) => void;
  onSendToSession?: (path: string) => void;
  sessionId?: string | null;
}

export function EditorTabs({
  tabs,
  activeTabPath,
  onTabClick,
  onTabClose,
  onClose,
  onCloseOthers,
  onCloseAll,
  onCloseLeft,
  onCloseRight,
  onTabReorder,
  onSendToSession,
  sessionId,
}: EditorTabsProps) {
  const { t } = useI18n();
  const draggedIndexRef = useRef<number | null>(null);
  const tabRefsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [menuTabPath, setMenuTabPath] = useState<string | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    draggedIndexRef.current = index;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault();
      const fromIndex = draggedIndexRef.current;
      if (fromIndex !== null && fromIndex !== toIndex && onTabReorder) {
        onTabReorder(fromIndex, toIndex);
      }
      draggedIndexRef.current = null;
    },
    [onTabReorder]
  );

  const menuTabIndex = useMemo(() => {
    if (!menuTabPath) return -1;
    return tabs.findIndex((tab) => tab.path === menuTabPath);
  }, [tabs, menuTabPath]);

  useEffect(() => {
    if (!activeTabPath) return;
    const frameId = requestAnimationFrame(() => {
      const tabEl = tabRefsRef.current.get(activeTabPath);
      tabEl?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    });
    return () => cancelAnimationFrame(frameId);
  }, [activeTabPath]);

  const canCloseOthers = !!onCloseOthers && !!menuTabPath && tabs.length > 1;
  const canCloseAll = !!onCloseAll && tabs.length > 0;
  const canCloseLeft = !!onCloseLeft && menuTabIndex > 0;
  const canCloseRight = !!onCloseRight && menuTabIndex >= 0 && menuTabIndex < tabs.length - 1;

  const handleCopyPath = useCallback(async () => {
    if (!menuTabPath) return;
    try {
      await navigator.clipboard.writeText(getDisplayPath(menuTabPath));
      const successCopy = buildClipboardToastCopy({ phase: 'success', subject: 'path' }, t);
      toastManager.add({
        title: successCopy.title,
        description: successCopy.description,
        type: 'success',
        timeout: 2000,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const errorCopy = buildClipboardToastCopy(
        { phase: 'error', subject: 'path', message: message || undefined },
        t
      );
      toastManager.add({
        title: errorCopy.title,
        description: errorCopy.description,
        type: 'error',
        timeout: 3000,
      });
    }
    setMenuOpen(false);
  }, [menuTabPath, t]);

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className="shrink-0 border-b border-border/60 bg-background/95 px-1.5 py-1">
      <ScrollArea className="h-full">
        <div className="control-topbar-tabs h-9 w-max min-w-full">
          {tabs.map((tab, index) => {
            const isActive = tab.path === activeTabPath;
            const Icon = getFileIcon(tab.title, false);
            const iconColor = getFileIconColor(tab.title, false);

            return (
              <div
                key={tab.path}
                ref={(el) => {
                  if (el) tabRefsRef.current.set(tab.path, el);
                  else tabRefsRef.current.delete(tab.path);
                }}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, index)}
                onClick={() => onTabClick(tab.path)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuTabPath(tab.path);
                  setMenuPosition({ x: e.clientX, y: e.clientY });
                  setMenuOpen(true);
                }}
                onKeyDown={(e) => e.key === 'Enter' && onTabClick(tab.path)}
                role="button"
                tabIndex={0}
                className={cn(
                  'control-topbar-tab group min-w-[120px] max-w-[192px] cursor-pointer select-none',
                  isActive
                    ? 'shadow-[0_10px_28px_color-mix(in_oklch,var(--theme)_10%,transparent)]'
                    : ''
                )}
                data-active={isActive}
              >
                {isActive && (
                  <motion.div
                    layoutId="editor-tab-indicator"
                    className="control-topbar-tab-surface"
                    transition={springFast}
                  />
                )}

                <span className="control-topbar-tab-icon">
                  <Icon className={cn('h-4 w-4 shrink-0', iconColor)} />
                </span>

                <span className="control-topbar-tab-label min-w-0 flex-1 truncate">
                  {tab.isDirty && <span className="mr-0.5">*</span>}
                  {tab.title}
                </span>

                <button
                  type="button"
                  onClick={(e) => onTabClose(tab.path, e)}
                  aria-label={t('Close Tab')}
                  className={cn(
                    'relative z-10 shrink-0 rounded-[0.34375rem] p-0.5 text-muted-foreground opacity-0 transition-all hover:bg-theme/10 hover:text-foreground',
                    'group-hover:opacity-100',
                    isActive && 'opacity-70'
                  )}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <Menu open={menuOpen} onOpenChange={setMenuOpen}>
        <MenuPopup
          style={{
            position: 'fixed',
            left: menuPosition.x,
            top: menuPosition.y,
          }}
        >
          <MenuItem
            disabled={!menuTabPath || !onClose}
            onClick={async () => {
              if (!menuTabPath || !onClose) return;
              await onClose(menuTabPath);
              setMenuOpen(false);
            }}
          >
            {t('Close Tab')}
          </MenuItem>
          <MenuItem
            disabled={!canCloseOthers}
            onClick={async () => {
              if (!menuTabPath || !onCloseOthers) return;
              await onCloseOthers(menuTabPath);
              setMenuOpen(false);
            }}
          >
            {t('Close Others')}
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            disabled={!canCloseLeft}
            onClick={async () => {
              if (!menuTabPath || !onCloseLeft) return;
              await onCloseLeft(menuTabPath);
              setMenuOpen(false);
            }}
          >
            {t('Close Tabs to the Left')}
          </MenuItem>
          <MenuItem
            disabled={!canCloseRight}
            onClick={async () => {
              if (!menuTabPath || !onCloseRight) return;
              await onCloseRight(menuTabPath);
              setMenuOpen(false);
            }}
          >
            {t('Close Tabs to the Right')}
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            disabled={!canCloseAll}
            onClick={async () => {
              if (!onCloseAll) return;
              await onCloseAll();
              setMenuOpen(false);
            }}
          >
            {t('Close All Tabs')}
          </MenuItem>
          <MenuSeparator />
          <MenuItem disabled={!menuTabPath} onClick={handleCopyPath}>
            {t('Copy Path')}
          </MenuItem>
          {sessionId && onSendToSession && (
            <>
              <MenuSeparator />
              <MenuItem
                disabled={!menuTabPath}
                onClick={() => {
                  if (!menuTabPath) return;
                  onSendToSession(menuTabPath);
                  setMenuOpen(false);
                }}
              >
                {t('Send to session')}
              </MenuItem>
            </>
          )}
        </MenuPopup>
      </Menu>
    </div>
  );
}
