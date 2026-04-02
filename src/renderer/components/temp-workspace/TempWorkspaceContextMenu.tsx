import { Copy, FolderOpen, Pencil, Sparkles, Terminal, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toastManager } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { buildClipboardToastCopy } from '@/lib/feedbackCopy';
import { cn } from '@/lib/utils';
import { useWorktreeActivityStore } from '@/stores/worktreeActivity';

const TEMP_WORKSPACE_CONTEXT_MENU_CLASS_NAME = 'control-menu fixed z-50 min-w-40 rounded-2xl p-2';
const TEMP_WORKSPACE_CONTEXT_MENU_ITEM_CLASS_NAME =
  'control-menu-item flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm';
const TEMP_WORKSPACE_CONTEXT_MENU_DANGER_ITEM_CLASS_NAME = cn(
  TEMP_WORKSPACE_CONTEXT_MENU_ITEM_CLASS_NAME,
  'control-menu-item-danger'
);
const TEMP_WORKSPACE_CONTEXT_MENU_DIVIDER_CLASS_NAME = 'control-divider my-1 h-px';

interface TempWorkspaceContextMenuProps {
  open: boolean;
  position: { x: number; y: number };
  path: string;
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
}

export function TempWorkspaceContextMenu({
  open,
  position,
  path,
  onClose,
  onRename,
  onDelete,
}: TempWorkspaceContextMenuProps) {
  const { t } = useI18n();
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState(position);
  const activities = useWorktreeActivityStore((s) => s.activities);
  const closeAgentSessions = useWorktreeActivityStore((s) => s.closeAgentSessions);
  const closeTerminalSessions = useWorktreeActivityStore((s) => s.closeTerminalSessions);
  const activity = activities[path] || { agentCount: 0, terminalCount: 0 };
  const hasActivity = activity.agentCount > 0 || activity.terminalCount > 0;

  useEffect(() => {
    if (!open) return;
    setMenuPosition(position);
  }, [open, position]);

  useLayoutEffect(() => {
    if (!open || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    let { x, y } = position;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    if (y + rect.height > viewportHeight - 8) {
      y = Math.max(8, viewportHeight - rect.height - 8);
    }
    if (x + rect.width > viewportWidth - 8) {
      x = Math.max(8, viewportWidth - rect.width - 8);
    }
    setMenuPosition({ x, y });
  }, [open, position]);

  const handleCopyPath = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(path);
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
  }, [path, t]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50"
        onClick={onClose}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
        role="presentation"
      />
      <div
        ref={menuRef}
        className={TEMP_WORKSPACE_CONTEXT_MENU_CLASS_NAME}
        style={{ left: menuPosition.x, top: menuPosition.y }}
      >
        {activity.agentCount > 0 && activity.terminalCount > 0 && (
          <button
            type="button"
            className={TEMP_WORKSPACE_CONTEXT_MENU_ITEM_CLASS_NAME}
            onClick={() => {
              onClose();
              closeAgentSessions(path);
              closeTerminalSessions(path);
            }}
          >
            <X className="h-4 w-4" />
            {t('Close All Sessions')}
          </button>
        )}
        {activity.agentCount > 0 && (
          <button
            type="button"
            className={TEMP_WORKSPACE_CONTEXT_MENU_ITEM_CLASS_NAME}
            onClick={() => {
              onClose();
              closeAgentSessions(path);
            }}
          >
            <X className="h-4 w-4" />
            <Sparkles className="h-4 w-4" />
            {t('Close Agent Sessions')}
          </button>
        )}
        {activity.terminalCount > 0 && (
          <button
            type="button"
            className={TEMP_WORKSPACE_CONTEXT_MENU_ITEM_CLASS_NAME}
            onClick={() => {
              onClose();
              closeTerminalSessions(path);
            }}
          >
            <X className="h-4 w-4" />
            <Terminal className="h-4 w-4" />
            {t('Close Terminal Sessions')}
          </button>
        )}
        {hasActivity && <div className={TEMP_WORKSPACE_CONTEXT_MENU_DIVIDER_CLASS_NAME} />}
        <button
          type="button"
          className={TEMP_WORKSPACE_CONTEXT_MENU_ITEM_CLASS_NAME}
          onClick={() => {
            onClose();
            window.electronAPI.shell.openPath(path);
          }}
        >
          <FolderOpen className="h-4 w-4" />
          {t('Open folder')}
        </button>
        <button
          type="button"
          className={TEMP_WORKSPACE_CONTEXT_MENU_ITEM_CLASS_NAME}
          onClick={() => {
            onClose();
            handleCopyPath();
          }}
        >
          <Copy className="h-4 w-4" />
          {t('Copy Path')}
        </button>
        <div className={TEMP_WORKSPACE_CONTEXT_MENU_DIVIDER_CLASS_NAME} />
        <button
          type="button"
          className={TEMP_WORKSPACE_CONTEXT_MENU_ITEM_CLASS_NAME}
          onClick={() => {
            onClose();
            onRename();
          }}
        >
          <Pencil className="h-4 w-4" />
          {t('Rename')}
        </button>
        <button
          type="button"
          className={TEMP_WORKSPACE_CONTEXT_MENU_DANGER_ITEM_CLASS_NAME}
          onClick={() => {
            onClose();
            onDelete();
          }}
        >
          <Trash2 className="h-4 w-4" />
          {t('Delete')}
        </button>
      </div>
    </>
  );
}
