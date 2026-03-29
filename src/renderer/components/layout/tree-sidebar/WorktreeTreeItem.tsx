import type { GitBranch as GitBranchType, GitWorktree } from '@shared/types';
import { getDisplayPath } from '@shared/utils/path';
import { Copy, FolderOpen, GitBranch, GitMerge, Sparkles, Terminal, Trash2, X } from 'lucide-react';
import {
  Fragment,
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { GitSyncButton } from '@/components/git/GitSyncButton';
import { toastManager } from '@/components/ui/toast';
import { useGitSync } from '@/hooks/useGitSync';
import { useWorktreeOutputState, useWorktreeTaskCompletionNotice } from '@/hooks/useOutputState';
import { useI18n } from '@/i18n';
import { buildClipboardToastCopy } from '@/lib/feedbackCopy';
import { focusFirstMenuItem, handleMenuNavigationKeyDown } from '@/lib/menuA11y';
import { cn } from '@/lib/utils';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { useWorktreeActivityStore } from '@/stores/worktreeActivity';
import { WorktreeAgentSummary } from '../WorktreeAgentSummary';

interface WorktreeTreeItemProps {
  worktree: GitWorktree;
  activeSession?: import('@/components/chat/SessionBar').Session;
  liveSubagents?: import('@shared/types').LiveAgentSubagent[];
  isActive: boolean;
  onClick: () => void;
  onOpenAgentThread?: (sessionId: string) => void;
  onOpenSubagentTranscript?: (subagent: import('@shared/types').LiveAgentSubagent) => void;
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

export function WorktreeTreeItem({
  worktree,
  activeSession,
  liveSubagents = [],
  isActive,
  onClick,
  onOpenAgentThread,
  onOpenSubagentTranscript,
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

  const activities = useWorktreeActivityStore((s) => s.activities);
  const diffStatsMap = useWorktreeActivityStore((s) => s.diffStats);
  const activityStates = useWorktreeActivityStore((s) => s.activityStates);
  const activity = activities[worktree.path] || {
    agentCount: 0,
    terminalCount: 0,
  };
  const diffStats = diffStatsMap[worktree.path] || {
    insertions: 0,
    deletions: 0,
  };
  const activityState = activityStates[worktree.path] || 'idle';
  const closeAgentSessions = useWorktreeActivityStore((s) => s.closeAgentSessions);
  const closeTerminalSessions = useWorktreeActivityStore((s) => s.closeTerminalSessions);
  const clearTaskCompletedUnreadByWorktree = useAgentSessionsStore(
    (s) => s.clearTaskCompletedUnreadByWorktree
  );
  const hasActivity = activity.agentCount > 0 || activity.terminalCount > 0;
  const hasDiffStats = diffStats.insertions > 0 || diffStats.deletions > 0;
  const hasCompletedTaskNotice = useWorktreeTaskCompletionNotice(worktree.path);

  const COMPLETED_STATE_DURATION_MS = 5000;
  useEffect(() => {
    if (isActive && activityState === 'completed') {
      const timer = setTimeout(() => {
        useWorktreeActivityStore.getState().clearActivityState(worktree.path);
      }, COMPLETED_STATE_DURATION_MS);
      return () => clearTimeout(timer);
    }
  }, [isActive, activityState, worktree.path]);

  const _outputState = useWorktreeOutputState(worktree.path);

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

  const activityLabel =
    activityState === 'running'
      ? 'Running'
      : activityState === 'waiting_input'
        ? 'Waiting'
        : activityState === 'completed'
          ? 'Done'
          : '';
  const metaItems = [
    activityState !== 'idle'
      ? {
          key: 'state',
          content: (
            <span
              className={cn(
                'control-tree-state',
                activityState === 'running' && 'control-tree-state-live',
                activityState === 'waiting_input' && 'control-tree-state-wait',
                activityState === 'completed' && 'control-tree-state-done'
              )}
            >
              {activityLabel}
            </span>
          ),
        }
      : null,
    hasDiffStats
      ? {
          key: 'diff',
          content: (
            <span className="control-tree-metric" data-kind="diff">
              {diffStats.insertions > 0 ? (
                <span className="control-tree-diff-positive">+{diffStats.insertions}</span>
              ) : null}
              {diffStats.insertions > 0 && diffStats.deletions > 0 ? ' ' : ''}
              {diffStats.deletions > 0 ? (
                <span className="control-tree-diff-negative">-{diffStats.deletions}</span>
              ) : null}
            </span>
          ),
        }
      : null,
    !tracking && currentBranch
      ? {
          key: 'publish',
          content: (
            <span className="control-tree-metric">
              <span className="control-tree-metric-label">{t('publish')}</span>
            </span>
          ),
        }
      : null,
    aheadCount > 0 || behindCount > 0
      ? {
          key: 'sync',
          content: (
            <span className="control-tree-metric" data-kind="sync">
              {aheadCount > 0 ? (
                <>
                  <span className="control-tree-metric-prefix">^</span>
                  <span className="control-tree-metric-value">{aheadCount}</span>
                </>
              ) : null}
              {aheadCount > 0 && behindCount > 0 ? (
                <span className="control-tree-separator">/</span>
              ) : null}
              {behindCount > 0 ? (
                <>
                  <span className="control-tree-metric-prefix">v</span>
                  <span className="control-tree-metric-value">{behindCount}</span>
                </>
              ) : null}
            </span>
          ),
        }
      : null,
    activity.agentCount > 0
      ? {
          key: 'agents',
          content: (
            <span className="control-tree-metric">
              <span className="control-tree-metric-value">{activity.agentCount}</span>
              <span className="control-tree-metric-label">{t('agents')}</span>
            </span>
          ),
        }
      : null,
    activity.terminalCount > 0
      ? {
          key: 'terminals',
          content: (
            <span className="control-tree-metric">
              <span className="control-tree-metric-value">{activity.terminalCount}</span>
              <span className="control-tree-metric-label">{t('terminals')}</span>
            </span>
          ),
        }
      : null,
  ].filter((item): item is { key: string; content: ReactElement } => item !== null);
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
        data-layout="inline"
      >
        <div className="control-tree-row">
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
          <button
            ref={menuTriggerRef}
            type="button"
            onClick={handleSelectWorktree}
            className="control-tree-primary min-w-0 flex flex-1 items-center text-left outline-none"
            data-surface="row"
            aria-current={isActive ? 'page' : undefined}
          >
            <div className="control-tree-primary-content items-center">
              <span
                className={cn(
                  'control-tree-title min-w-0 flex-1 truncate',
                  isPrunable && 'line-through'
                )}
              >
                {branchDisplay}
              </span>
              {hasCompletedTaskNotice ? <span className="control-task-completion-dot" /> : null}
              {metaItems.length > 0 ? (
                <div className="control-tree-meta control-tree-meta-inline">
                  {metaItems.map((item, index) => (
                    <Fragment key={item.key}>
                      {index > 0 ? <span className="control-tree-separator">·</span> : null}
                      {item.content}
                    </Fragment>
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
              />
            </div>
          ) : null}
        </div>
        {activeSession ? (
          <WorktreeAgentSummary
            className="pl-5 pt-1"
            session={activeSession}
            subagents={liveSubagents}
            onSelectSession={onOpenAgentThread}
            onSelectSubagent={onOpenSubagentTranscript}
          />
        ) : null}
      </div>
      {showDropIndicator && dropDirection === 'bottom' && (
        <div className="absolute -bottom-0.5 left-0 right-0 h-0.5 rounded-full bg-theme/75" />
      )}
    </>
  );

  return (
    <>
      <div className="control-tree-guide-item">{buttonContent}</div>

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
}
