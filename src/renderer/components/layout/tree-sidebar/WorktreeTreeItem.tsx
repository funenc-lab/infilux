import type { GitBranch as GitBranchType, GitWorktree } from '@shared/types';
import { getDisplayPath } from '@shared/utils/path';
import { Copy, FolderOpen, GitBranch, GitMerge, Sparkles, Terminal, Trash2, X } from 'lucide-react';
import { memo, type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GitSyncButton } from '@/components/git/GitSyncButton';
import { WorktreeActivityMarker } from '@/components/layout/WorktreeActivityMarker';
import { toastManager } from '@/components/ui/toast';
import { useGitSync } from '@/hooks/useGitSync';
import { useWorktreeTaskCompletionNotice } from '@/hooks/useOutputState';
import { useI18n } from '@/i18n';
import { buildClipboardToastCopy } from '@/lib/feedbackCopy';
import { focusFirstMenuItem, handleMenuNavigationKeyDown } from '@/lib/menuA11y';
import { cn } from '@/lib/utils';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { useWorktreeActivityStore } from '@/stores/worktreeActivity';

const DEFAULT_ACTIVITY = Object.freeze({
  agentCount: 0,
  terminalCount: 0,
});

const DEFAULT_DIFF_STATS = Object.freeze({
  insertions: 0,
  deletions: 0,
});

interface WorktreeTreeItemProps {
  worktree: GitWorktree;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
  onMerge?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  showDropIndicator?: boolean;
  dropDirection?: 'top' | 'bottom' | null;
  branches?: GitBranchType[];
}

function areWorktreeTreeItemPropsEqual(
  previousProps: WorktreeTreeItemProps,
  nextProps: WorktreeTreeItemProps
) {
  const previousWorktree = previousProps.worktree;
  const nextWorktree = nextProps.worktree;

  return (
    previousWorktree.path === nextWorktree.path &&
    previousWorktree.head === nextWorktree.head &&
    previousWorktree.branch === nextWorktree.branch &&
    previousWorktree.isMainWorktree === nextWorktree.isMainWorktree &&
    previousWorktree.isLocked === nextWorktree.isLocked &&
    previousWorktree.prunable === nextWorktree.prunable &&
    previousProps.isActive === nextProps.isActive &&
    previousProps.draggable === nextProps.draggable &&
    previousProps.showDropIndicator === nextProps.showDropIndicator &&
    previousProps.dropDirection === nextProps.dropDirection &&
    previousProps.branches === nextProps.branches
  );
}

export const WorktreeTreeItem = memo(function WorktreeTreeItem({
  worktree,
  isActive,
  onClick,
  onDelete,
  onMerge,
  draggable,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  showDropIndicator,
  dropDirection,
  branches = [],
}: WorktreeTreeItemProps) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const menuWasOpenRef = useRef(false);
  const isMain =
    worktree.isMainWorktree || worktree.branch === 'main' || worktree.branch === 'master';
  const branchDisplay = worktree.branch || t('Detached');
  const isPrunable = worktree.prunable;
  const displayWorktreePath = getDisplayPath(worktree.path);

  const isMerged = useMemo(() => {
    if (!worktree.branch || isMain) return false;
    const branch = branches.find((b) => b.name === worktree.branch);
    return branch?.merged === true;
  }, [worktree.branch, isMain, branches]);

  const activity = useWorktreeActivityStore((s) => s.activities[worktree.path] ?? DEFAULT_ACTIVITY);
  const diffStats = useWorktreeActivityStore(
    (s) => s.diffStats[worktree.path] ?? DEFAULT_DIFF_STATS
  );
  const activityState = useWorktreeActivityStore((s) => s.activityStates[worktree.path] ?? 'idle');
  const closeAgentSessions = useWorktreeActivityStore((s) => s.closeAgentSessions);
  const closeTerminalSessions = useWorktreeActivityStore((s) => s.closeTerminalSessions);
  const clearTaskCompletedUnreadByWorktree = useAgentSessionsStore(
    (s) => s.clearTaskCompletedUnreadByWorktree
  );
  const hasActivity = activity.agentCount > 0 || activity.terminalCount > 0;
  const hasDiffStats = diffStats.insertions > 0 || diffStats.deletions > 0;
  const hasCompletedTaskNotice = useWorktreeTaskCompletionNotice(worktree.path);
  const totalActivityCount = activity.agentCount + activity.terminalCount;
  const ActivityIcon = activity.agentCount > 0 ? Sparkles : Terminal;
  const activitySummary = [
    activity.agentCount > 0 ? `${activity.agentCount} ${t('agents')}` : null,
    activity.terminalCount > 0 ? `${activity.terminalCount} ${t('terminals')}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const COMPLETED_STATE_DURATION_MS = 5000;
  useEffect(() => {
    if (isActive && activityState === 'completed') {
      const timer = setTimeout(() => {
        useWorktreeActivityStore.getState().clearActivityState(worktree.path);
      }, COMPLETED_STATE_DURATION_MS);
      return () => clearTimeout(timer);
    }

    return undefined;
  }, [isActive, activityState, worktree.path]);

  const {
    ahead: aheadCount,
    behind: behindCount,
    tracking,
    currentBranch,
    isSyncing,
    handleSync,
    handlePublish,
  } = useGitSync({ workdir: worktree.path, enabled: isActive });

  const handleCopyPath = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(displayWorktreePath);
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
  }, [displayWorktreePath, t]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuPosition({ x: e.clientX, y: e.clientY });
    setMenuOpen(true);
  };

  useEffect(() => {
    if (menuOpen && menuRef.current) {
      focusFirstMenuItem(menuRef.current);
      const menu = menuRef.current;
      const rect = menu.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;

      let { x, y } = menuPosition;

      if (y + rect.height > viewportHeight - 8) {
        y = Math.max(8, viewportHeight - rect.height - 8);
      }

      if (x + rect.width > viewportWidth - 8) {
        x = Math.max(8, viewportWidth - rect.width - 8);
      }

      if (x !== menuPosition.x || y !== menuPosition.y) {
        setMenuPosition({ x, y });
      }
    }
  }, [menuOpen, menuPosition]);

  useEffect(() => {
    if (menuOpen) {
      menuWasOpenRef.current = true;
      return;
    }

    if (menuWasOpenRef.current) {
      menuTriggerRef.current?.focus();
      menuWasOpenRef.current = false;
    }
  }, [menuOpen]);

  const inlineItems = [
    isMain
      ? {
          key: 'main',
          priority: 'medium' as const,
          content: <span className="control-tree-flag control-tree-flag-main">{t('Main')}</span>,
        }
      : !isPrunable && isMerged
        ? {
            key: 'merged',
            priority: 'medium' as const,
            content: (
              <span className="control-tree-flag control-tree-flag-merged">{t('Merged')}</span>
            ),
          }
        : null,
    hasDiffStats
      ? {
          key: 'diff',
          priority: 'critical' as const,
          content: (
            <span className="control-tree-diff-badge" data-kind="diff">
              {diffStats.insertions > 0 ? (
                <span className="control-tree-diff-positive">+{diffStats.insertions}</span>
              ) : null}
              {diffStats.deletions > 0 ? (
                <span className="control-tree-diff-negative">-{diffStats.deletions}</span>
              ) : null}
            </span>
          ),
        }
      : null,
    aheadCount > 0 || behindCount > 0
      ? {
          key: 'sync',
          priority: 'critical' as const,
          content: (
            <span className="control-tree-sync-inline" data-kind="sync">
              {aheadCount > 0 ? (
                <span className="control-tree-sync-inline-segment">
                  <span className="control-tree-metric-prefix">^</span>
                  <span className="control-tree-metric-value">{aheadCount}</span>
                </span>
              ) : null}
              {aheadCount > 0 && behindCount > 0 ? (
                <span className="control-tree-separator">/</span>
              ) : null}
              {behindCount > 0 ? (
                <span className="control-tree-sync-inline-segment">
                  <span className="control-tree-metric-prefix">v</span>
                  <span className="control-tree-metric-value">{behindCount}</span>
                </span>
              ) : null}
            </span>
          ),
        }
      : null,
    totalActivityCount > 0
      ? {
          key: 'agents',
          priority: 'low' as const,
          content: (
            <span className="control-tree-metric" title={activitySummary}>
              <ActivityIcon className="control-tree-metric-icon" aria-hidden="true" />
              <span className="control-tree-metric-value">{totalActivityCount}</span>
              <span className="sr-only">{activitySummary}</span>
            </span>
          ),
        }
      : null,
    hasCompletedTaskNotice
      ? {
          key: 'completed',
          priority: 'low' as const,
          content: <span className="control-task-completion-dot" />,
        }
      : null,
  ].filter(
    (
      item
    ): item is {
      key: string;
      priority: 'critical' | 'medium' | 'low';
      content: ReactElement;
    } => item !== null
  );
  const hasSyncAction =
    Boolean(!tracking && currentBranch && handlePublish) ||
    Boolean(tracking && (aheadCount > 0 || behindCount > 0) && handleSync);
  const handleSelectWorktree = useCallback(() => {
    clearTaskCompletedUnreadByWorktree(worktree.path);
    onClick();
  }, [clearTaskCompletedUnreadByWorktree, onClick, worktree.path]);
  const buttonContent = (
    <>
      {showDropIndicator && dropDirection === 'top' && (
        <div className="absolute -top-0.5 left-0 right-0 h-0.5 rounded-full bg-theme/75" />
      )}
      <div
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onContextMenu={handleContextMenu}
        className={cn(
          'control-tree-node relative flex w-full flex-col gap-0.5 px-2 py-1 text-left text-sm transition-colors cursor-pointer',
          isPrunable && 'opacity-50'
        )}
        data-active={isActive ? 'worktree' : 'false'}
        data-node-kind="worktree"
      >
        <div className="control-tree-row">
          <button
            ref={menuTriggerRef}
            type="button"
            onClick={handleSelectWorktree}
            className="control-tree-primary relative min-w-0 flex-1 text-left outline-none"
            data-surface="row"
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="control-tree-status-slot">
              <WorktreeActivityMarker state={activityState} />
            </span>
            <div className="control-tree-primary-content control-tree-primary-content-worktree">
              <span className="control-tree-glyph h-4 w-4 shrink-0">
                <GitBranch
                  className={cn(
                    'control-tree-icon h-3.5 w-3.5',
                    isPrunable && 'control-tree-branch-icon-deleted',
                    !isPrunable && isMain && 'control-tree-branch-icon-main',
                    !isPrunable && !isMain && isMerged && 'control-tree-branch-icon-merged',
                    !isPrunable && !isMain && !isMerged && 'control-tree-branch-icon'
                  )}
                />
              </span>
              <div className="control-tree-text-stack">
                <div className="control-tree-title-row">
                  <span
                    className={cn(
                      'control-tree-title min-w-0 flex-1 truncate',
                      isPrunable && 'line-through'
                    )}
                  >
                    {branchDisplay}
                  </span>
                </div>
              </div>
              {inlineItems.length > 0 ? (
                <div className="control-tree-inline-signals">
                  {inlineItems.map((item) => (
                    <span
                      key={item.key}
                      className="control-tree-inline-item"
                      data-signal-priority={item.priority}
                    >
                      {item.content}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </button>

          {hasSyncAction ? (
            <div className="control-tree-tail" data-role="action">
              <GitSyncButton
                ahead={aheadCount}
                behind={behindCount}
                tracking={tracking}
                currentBranch={currentBranch}
                isSyncing={isSyncing}
                onSync={handleSync}
                onPublish={handlePublish}
                className="min-h-6 rounded-md px-1 py-0.5"
              />
            </div>
          ) : null}
        </div>
      </div>
      {showDropIndicator && dropDirection === 'bottom' && (
        <div className="absolute -bottom-0.5 left-0 right-0 h-0.5 rounded-full bg-theme/75" />
      )}
    </>
  );

  return (
    <>
      <div className="control-tree-guide-item min-w-0">{buttonContent}</div>

      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-50"
            onClick={() => setMenuOpen(false)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenuOpen(false);
            }}
            role="presentation"
          />
          <div
            ref={menuRef}
            className="control-menu fixed z-50 min-w-40 rounded-lg p-1"
            style={{ left: menuPosition.x, top: menuPosition.y }}
            role="menu"
            aria-label={t('Worktree actions')}
            onKeyDown={(e) => handleMenuNavigationKeyDown(e, () => setMenuOpen(false))}
          >
            {activity.agentCount > 0 && activity.terminalCount > 0 && (
              <button
                type="button"
                className="control-menu-item flex w-full items-center gap-2 rounded-md px-2 py-1.5"
                onClick={() => {
                  setMenuOpen(false);
                  closeAgentSessions(worktree.path);
                  closeTerminalSessions(worktree.path);
                }}
                role="menuitem"
              >
                <X className="h-4 w-4" />
                {t('Close All Sessions')}
              </button>
            )}

            {activity.agentCount > 0 && (
              <button
                type="button"
                className="control-menu-item flex w-full items-center gap-2 rounded-md px-2 py-1.5"
                onClick={() => {
                  setMenuOpen(false);
                  closeAgentSessions(worktree.path);
                }}
                role="menuitem"
              >
                <X className="h-4 w-4" />
                <Sparkles className="h-4 w-4" />
                {t('Close Agent Sessions')}
              </button>
            )}

            {activity.terminalCount > 0 && (
              <button
                type="button"
                className="control-menu-item flex w-full items-center gap-2 rounded-md px-2 py-1.5"
                onClick={() => {
                  setMenuOpen(false);
                  closeTerminalSessions(worktree.path);
                }}
                role="menuitem"
              >
                <X className="h-4 w-4" />
                <Terminal className="h-4 w-4" />
                {t('Close Terminal Sessions')}
              </button>
            )}

            {hasActivity && <div className="my-1 h-px bg-border" />}

            <button
              type="button"
              className="control-menu-item flex w-full items-center gap-2 rounded-md px-2 py-1.5"
              onClick={() => {
                setMenuOpen(false);
                window.electronAPI.shell.openPath(worktree.path);
              }}
              role="menuitem"
            >
              <FolderOpen className="h-4 w-4" />
              {t('Open folder')}
            </button>

            <button
              type="button"
              className="control-menu-item flex w-full items-center gap-2 rounded-md px-2 py-1.5"
              onClick={() => {
                setMenuOpen(false);
                handleCopyPath();
              }}
              role="menuitem"
            >
              <Copy className="h-4 w-4" />
              {t('Copy Path')}
            </button>

            {onMerge && !isMain && !isPrunable && (
              <button
                type="button"
                className="control-menu-item flex w-full items-center gap-2 rounded-md px-2 py-1.5"
                onClick={() => {
                  setMenuOpen(false);
                  onMerge();
                }}
                role="menuitem"
              >
                <GitMerge className="h-4 w-4" />
                {t('Merge to Branch...')}
              </button>
            )}

            <div className="my-1 h-px bg-border" />

            <button
              type="button"
              className={cn(
                'control-menu-item control-menu-item-danger flex w-full items-center gap-2 rounded-md px-2 py-1.5',
                isMain && 'pointer-events-none opacity-50'
              )}
              onClick={() => {
                setMenuOpen(false);
                onDelete();
              }}
              disabled={isMain}
              role="menuitem"
            >
              <Trash2 className="h-4 w-4" />
              {isPrunable ? t('Clean up records') : t('Delete')}
            </button>
          </div>
        </>
      )}
    </>
  );
}, areWorktreeTreeItemPropsEqual);
