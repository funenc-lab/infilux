import type {
  GitBranch as GitBranchType,
  GitWorktree,
  RemoteConnectionStatus,
  WorktreeCreateOptions,
} from '@shared/types';
import { getDisplayPath, getDisplayPathBasename, isWslUncPath } from '@shared/utils/path';
import { LayoutGroup, motion } from 'framer-motion';
import {
  Copy,
  FolderOpen,
  GitBranch,
  GitMerge,
  PanelLeftClose,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GitSyncButton } from '@/components/git/GitSyncButton';
import { ActivityIndicator } from '@/components/ui/activity-indicator';
import { getActivityStateMeta } from '@/components/ui/activityStatus';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { GlowBorder, type GlowState, useGlowEffectEnabled } from '@/components/ui/glow-card';
import { toastManager } from '@/components/ui/toast';
import { CreateWorktreeDialog } from '@/components/worktree/CreateWorktreeDialog';
import { useGitSync } from '@/hooks/useGitSync';
import { useWorktreeOutputState } from '@/hooks/useOutputState';
import { useShouldPoll } from '@/hooks/useWindowFocus';
import { useI18n } from '@/i18n';
import { buildClipboardToastCopy, buildRemovalDialogCopy } from '@/lib/feedbackCopy';
import { focusFirstMenuItem, handleMenuNavigationKeyDown } from '@/lib/menuA11y';
import { springFast } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useWorktreeActivityStore } from '@/stores/worktreeActivity';
import { SidebarEmptyState } from './SidebarEmptyState';

interface WorktreePanelProps {
  worktrees: GitWorktree[];
  activeWorktree: GitWorktree | null;
  branches: GitBranchType[];
  projectName: string;
  inactiveRemote?: boolean;
  remoteStatus?: RemoteConnectionStatus | null;
  isLoading?: boolean;
  isCreating?: boolean;
  error?: string | null;
  onSelectWorktree: (worktree: GitWorktree) => void;
  onCreateWorktree: (options: WorktreeCreateOptions) => Promise<void>;
  onRemoveWorktree: (
    worktree: GitWorktree,
    options?: { deleteBranch?: boolean; force?: boolean }
  ) => void;
  onMergeWorktree?: (worktree: GitWorktree) => void;
  onReorderWorktrees?: (fromIndex: number, toIndex: number) => void;
  onRefresh: () => void;
  onInitGit?: () => Promise<void>;
  width?: number;
  collapsed?: boolean;
  onCollapse?: () => void;
  repositoryCollapsed?: boolean;
  onExpandRepository?: () => void;
}

export function WorktreePanel({
  worktrees,
  activeWorktree,
  branches,
  projectName,
  inactiveRemote = false,
  remoteStatus = null,
  isLoading,
  isCreating,
  error,
  onSelectWorktree,
  onCreateWorktree,
  onRemoveWorktree,
  onMergeWorktree,
  onReorderWorktrees,
  onRefresh,
  onInitGit,
  width: _width = 280,
  collapsed: _collapsed = false,
  onCollapse,
  repositoryCollapsed = false,
  onExpandRepository,
}: WorktreePanelProps) {
  const { t, tNode } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const [worktreeToDelete, setWorktreeToDelete] = useState<GitWorktree | null>(null);
  const [deleteBranch, setDeleteBranch] = useState(false);
  const [forceDelete, setForceDelete] = useState(false);
  const deleteWorktreeName = worktreeToDelete?.branch || t('Detached');
  const deleteWorktreeDialogCopy = worktreeToDelete
    ? buildRemovalDialogCopy(
        {
          kind: 'worktree',
          name: deleteWorktreeName,
          prunable: worktreeToDelete.prunable,
        },
        t
      )
    : null;

  // Drag reorder
  const draggedIndexRef = useRef<number | null>(null);
  const dragImageRef = useRef<HTMLDivElement | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  const handleDragStart = useCallback(
    (e: React.DragEvent, index: number, worktree: GitWorktree) => {
      draggedIndexRef.current = index;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));

      // Create styled drag image
      const dragImage = document.createElement('div');
      dragImage.textContent = worktree.branch || getDisplayPathBasename(worktree.path);
      dragImage.style.cssText = `
        position: fixed;
        top: -9999px;
        left: -9999px;
        padding: 8px 12px;
        background-color: var(--accent);
        color: var(--accent-foreground);
        font-size: 14px;
        font-weight: 500;
        border-radius: 8px;
        white-space: nowrap;
        pointer-events: none;
      `;
      document.body.appendChild(dragImage);
      dragImageRef.current = dragImage;
      e.dataTransfer.setDragImage(dragImage, dragImage.offsetWidth / 2, dragImage.offsetHeight / 2);
    },
    []
  );

  const handleDragEnd = useCallback(() => {
    if (dragImageRef.current) {
      document.body.removeChild(dragImageRef.current);
      dragImageRef.current = null;
    }
    draggedIndexRef.current = null;
    setDropTargetIndex(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedIndexRef.current !== null && draggedIndexRef.current !== index) {
      setDropTargetIndex(index);
    }
  }, []);

  const handleDragLeave = useCallback(() => {
    setDropTargetIndex(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault();
      const fromIndex = draggedIndexRef.current;
      if (fromIndex !== null && fromIndex !== toIndex && onReorderWorktrees) {
        onReorderWorktrees(fromIndex, toIndex);
      }
      setDropTargetIndex(null);
    },
    [onReorderWorktrees]
  );

  // Keep track of original indices for drag reorder when filtering
  const filteredWorktreesWithIndex = worktrees
    .map((wt, index) => ({ worktree: wt, originalIndex: index }))
    .filter(
      ({ worktree: wt }) =>
        wt.branch?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        getDisplayPath(wt.path).toLowerCase().includes(searchQuery.toLowerCase())
    );
  const renderSidebarMeta = useCallback(
    (items: Array<{ label: string; value: string }>) => (
      <div className="space-y-1">
        {items.map((item) => (
          <div key={item.label}>
            <span className="font-medium text-foreground">{item.label}: </span>
            <span>{item.value}</span>
          </div>
        ))}
      </div>
    ),
    []
  );

  // Get the main worktree path for git operations
  const mainWorktree = worktrees.find((wt) => wt.isMainWorktree);
  const workdir = mainWorktree?.path || '';

  const fetchDiffStats = useWorktreeActivityStore((s) => s.fetchDiffStats);
  const activities = useWorktreeActivityStore((s) => s.activities);
  const shouldPoll = useShouldPoll();
  const isRemoteReconnecting = remoteStatus?.phase === 'reconnecting';
  const isRemoteFailed = Boolean(
    inactiveRemote &&
      remoteStatus &&
      remoteStatus.phase === 'failed' &&
      remoteStatus.recoverable === false
  );
  const remoteEmptyTitle = isRemoteReconnecting
    ? t('Remote connection lost. Attempting to reconnect...')
    : isRemoteFailed
      ? t('Remote connection lost')
      : t('Remote repository is not connected yet');
  const remoteEmptyDescription = isRemoteReconnecting
    ? t('Reconnecting remote connection...')
    : isRemoteFailed
      ? remoteStatus?.error || t('Remote connection lost')
      : t('Click the selected repository again to connect and load worktrees.');

  useEffect(() => {
    if (worktrees.length === 0 || !shouldPoll) return;
    const activePaths = worktrees
      .filter((wt) => {
        const activity = activities[wt.path];
        return activity && (activity.agentCount > 0 || activity.terminalCount > 0);
      })
      .map((wt) => wt.path);

    if (activePaths.length === 0) return;

    fetchDiffStats(activePaths);
    const interval = setInterval(() => {
      fetchDiffStats(activePaths);
    }, 10000);
    return () => clearInterval(interval);
  }, [worktrees, activities, fetchDiffStats, shouldPoll]);

  return (
    <aside className="control-sidebar flex h-full w-full flex-col border-r bg-background">
      {/* Header with buttons */}
      <div
        className={cn(
          'flex h-12 items-center justify-end gap-1 border-b px-3 drag-region',
          repositoryCollapsed && 'pl-[70px]'
        )}
      >
        {/* Expand repository button when collapsed */}
        {repositoryCollapsed && onExpandRepository && (
          <button
            type="button"
            className="control-panel-muted flex h-8 w-8 items-center justify-center rounded-xl no-drag text-muted-foreground transition-colors hover:text-foreground"
            onClick={onExpandRepository}
            title={t('Expand Repository')}
          >
            <FolderOpen className="h-4 w-4" />
          </button>
        )}
        {/* Refresh button */}
        <button
          type="button"
          className="control-panel-muted flex h-8 w-8 items-center justify-center rounded-xl no-drag text-muted-foreground transition-colors hover:text-foreground"
          onClick={onRefresh}
          title={t('Refresh')}
          disabled={inactiveRemote}
        >
          <RefreshCw className="h-4 w-4" />
        </button>
        {/* Collapse button */}
        {onCollapse && (
          <button
            type="button"
            className="control-panel-muted flex h-8 w-8 items-center justify-center rounded-xl no-drag text-muted-foreground transition-colors hover:text-foreground"
            onClick={onCollapse}
            title={t('Collapse')}
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Search bar */}
      <div className="px-3 py-2">
        <div className="control-input flex h-10 items-center gap-2 rounded-xl px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="text"
            aria-label={t('Search worktrees')}
            placeholder={t('Search worktrees')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
          />
        </div>
      </div>

      {/* Worktree List */}
      <div className="flex-1 overflow-auto p-2">
        {inactiveRemote ? (
          <div className="flex h-full items-start justify-start px-2 py-3">
            <SidebarEmptyState
              icon={<GitBranch className="h-4.5 w-4.5" />}
              label={t('Remote Unavailable')}
              title={remoteEmptyTitle}
              description={remoteEmptyDescription}
              meta={renderSidebarMeta([
                {
                  label: t('Status'),
                  value: isRemoteReconnecting
                    ? t('Connection recovery in progress')
                    : t('Remote runtime unavailable'),
                },
                { label: t('Repository'), value: projectName || t('Remote repository') },
                {
                  label: t('Next Step'),
                  value: isRemoteReconnecting
                    ? t('Wait for the remote connection to recover')
                    : t('Reconnect the selected repository to load worktrees'),
                },
              ])}
            />
          </div>
        ) : error ? (
          <div className="flex h-full items-start justify-start px-2 py-3">
            <SidebarEmptyState
              icon={<GitBranch className="h-4.5 w-4.5" />}
              label={t('Repository Required')}
              title={t('Not a Git repository')}
              description={t(
                'This directory is not a Git repository. Initialize it to enable branches, worktrees, and source-control workflows.'
              )}
              meta={renderSidebarMeta([
                { label: t('Status'), value: t('Git metadata not found') },
                { label: t('Repository'), value: projectName || t('Current directory') },
                { label: t('Next Step'), value: t('Refresh or initialize the repository') },
              ])}
              actions={
                <>
                  <Button
                    onClick={onRefresh}
                    variant="outline"
                    size="sm"
                    className="control-action-button control-action-button-secondary h-8 rounded-lg px-3 text-sm"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {t('Refresh')}
                  </Button>
                  {onInitGit && (
                    <Button
                      onClick={onInitGit}
                      variant="default"
                      size="sm"
                      className="control-action-button control-action-button-primary min-w-0 rounded-lg px-3.5 text-sm font-semibold tracking-[-0.01em]"
                    >
                      <GitBranch className="h-4 w-4" />
                      {t('Initialize repository')}
                    </Button>
                  )}
                </>
              }
            />
          </div>
        ) : isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <WorktreeItemSkeleton key={`skeleton-${i}`} />
            ))}
          </div>
        ) : filteredWorktreesWithIndex.length === 0 ? (
          <div className="flex h-full items-start justify-start px-2 py-3">
            <SidebarEmptyState
              icon={<GitBranch className="h-4.5 w-4.5" />}
              label={searchQuery ? t('Filtered View') : t('Awaiting Worktree')}
              title={searchQuery ? t('No matching worktrees') : t('No worktrees')}
              description={
                searchQuery
                  ? t(
                      'No worktrees match the current search. Adjust the query to broaden the result set.'
                    )
                  : t(
                      'Create your first worktree to branch work safely without leaving the main repository context.'
                    )
              }
              meta={renderSidebarMeta([
                {
                  label: t('Status'),
                  value: searchQuery
                    ? t('Search returned no worktrees')
                    : t('No worktrees have been created'),
                },
                {
                  label: t('Repository'),
                  value: projectName || t('Current repository'),
                },
                {
                  label: t('Next Step'),
                  value: searchQuery
                    ? t('Try another search term')
                    : t('Create a worktree to start a new branch context'),
                },
              ])}
              actions={
                !searchQuery ? (
                  <CreateWorktreeDialog
                    branches={branches}
                    projectName={projectName}
                    workdir={workdir}
                    isLoading={isCreating}
                    onSubmit={onCreateWorktree}
                    trigger={
                      <Button
                        variant="default"
                        size="sm"
                        className="control-action-button control-action-button-primary min-w-0 rounded-lg px-3.5 text-sm font-semibold tracking-[-0.01em]"
                      >
                        <Plus className="h-4 w-4" />
                        {t('Create Worktree')}
                      </Button>
                    }
                  />
                ) : null
              }
            />
          </div>
        ) : (
          <LayoutGroup>
            <div className="space-y-1">
              {filteredWorktreesWithIndex.map(({ worktree, originalIndex }) => (
                <WorktreeItem
                  key={worktree.path}
                  worktree={worktree}
                  branches={branches}
                  isActive={activeWorktree?.path === worktree.path}
                  onClick={() => onSelectWorktree(worktree)}
                  onDelete={() => setWorktreeToDelete(worktree)}
                  onMerge={onMergeWorktree ? () => onMergeWorktree(worktree) : undefined}
                  draggable={!searchQuery && !!onReorderWorktrees}
                  onDragStart={(e) => handleDragStart(e, originalIndex, worktree)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, originalIndex)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, originalIndex)}
                  showDropIndicator={dropTargetIndex === originalIndex}
                  dropDirection={
                    dropTargetIndex === originalIndex && draggedIndexRef.current !== null
                      ? draggedIndexRef.current > originalIndex
                        ? 'top'
                        : 'bottom'
                      : null
                  }
                />
              ))}
            </div>
          </LayoutGroup>
        )}
      </div>

      {/* Footer - Create Worktree Button */}
      <div className="shrink-0 border-t p-2">
        <CreateWorktreeDialog
          branches={branches}
          projectName={projectName}
          workdir={workdir}
          isLoading={isCreating}
          onSubmit={onCreateWorktree}
          trigger={
            <button
              type="button"
              className="control-panel-muted flex h-10 w-full items-center justify-start gap-2 rounded-xl px-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
              {t('New Worktree')}
            </button>
          }
        />
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!worktreeToDelete}
        onOpenChange={(open) => {
          if (!open) {
            setWorktreeToDelete(null);
            setDeleteBranch(false);
          }
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteWorktreeDialogCopy?.title ?? t('Delete Worktree')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteWorktreeDialogCopy?.description}
              {worktreeToDelete?.prunable ? (
                <span className="block mt-2 text-muted-foreground">
                  {deleteWorktreeDialogCopy?.consequence}
                </span>
              ) : (
                <span className="block mt-2 text-destructive">
                  {deleteWorktreeDialogCopy?.consequence}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1">
            {worktreeToDelete?.branch && !worktreeToDelete?.isMainWorktree && (
              <label className="flex items-center gap-2 px-6 py-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={deleteBranch}
                  onChange={(e) => setDeleteBranch(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                <span>
                  {tNode('Also delete branch {{name}}', {
                    name: <strong>{worktreeToDelete.branch}</strong>,
                  })}
                </span>
              </label>
            )}
            {!worktreeToDelete?.prunable && (
              <label className="flex items-center gap-2 px-6 py-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={forceDelete}
                  onChange={(e) => setForceDelete(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                <span className="text-muted-foreground">
                  {t('Force delete (ignore uncommitted changes)')}
                </span>
              </label>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline">{t('Cancel')}</Button>} />
            <Button
              variant="destructive"
              onClick={() => {
                if (worktreeToDelete) {
                  onRemoveWorktree(worktreeToDelete, {
                    deleteBranch,
                    force: forceDelete,
                  });
                  setWorktreeToDelete(null);
                  setDeleteBranch(false);
                  setForceDelete(false);
                }
              }}
            >
              {deleteWorktreeDialogCopy?.actionLabel ?? t('Delete worktree')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </aside>
  );
}

interface WorktreeItemProps {
  worktree: GitWorktree;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
  onMerge?: () => void;
  // Drag reorder props
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

function WorktreeItem({
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
}: WorktreeItemProps) {
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
  const useLtrPathDisplay = isWslUncPath(displayWorktreePath);
  const glowEnabled = useGlowEffectEnabled();

  // Git sync operations
  const { ahead, behind, tracking, currentBranch, isSyncing, handleSync, handlePublish } =
    useGitSync({ workdir: worktree.path, enabled: isActive });

  // Check if branch is merged to main
  const isMerged = useMemo(() => {
    if (!worktree.branch || isMain) return false;
    const branch = branches.find((b) => b.name === worktree.branch);
    return branch?.merged === true;
  }, [worktree.branch, isMain, branches]);

  // Subscribe to activity store
  const activities = useWorktreeActivityStore((s) => s.activities);
  const diffStatsMap = useWorktreeActivityStore((s) => s.diffStats);
  const activity = activities[worktree.path] || {
    agentCount: 0,
    terminalCount: 0,
  };
  const diffStats = diffStatsMap[worktree.path] || {
    insertions: 0,
    deletions: 0,
  };
  const activityStates = useWorktreeActivityStore((s) => s.activityStates);
  const closeAgentSessions = useWorktreeActivityStore((s) => s.closeAgentSessions);
  const closeTerminalSessions = useWorktreeActivityStore((s) => s.closeTerminalSessions);
  const hasActivity = activity.agentCount > 0 || activity.terminalCount > 0;
  const hasDiffStats = diffStats.insertions > 0 || diffStats.deletions > 0;
  const activityState = activityStates[worktree.path] || 'idle';

  // Check if any session in this worktree has outputting or unread state
  const outputState = useWorktreeOutputState(worktree.path);

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
    const x = e.clientX;
    const y = e.clientY;
    // Will adjust position after menu renders
    setMenuPosition({ x, y });
    setMenuOpen(true);
  };

  // Adjust menu position if it overflows viewport
  useEffect(() => {
    if (menuOpen && menuRef.current) {
      focusFirstMenuItem(menuRef.current);
      const menu = menuRef.current;
      const rect = menu.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;

      let { x, y } = menuPosition;

      // Adjust if menu overflows bottom
      if (y + rect.height > viewportHeight - 8) {
        y = Math.max(8, viewportHeight - rect.height - 8);
      }

      // Adjust if menu overflows right
      if (x + rect.width > viewportWidth - 8) {
        x = Math.max(8, viewportWidth - rect.width - 8);
      }

      if (x !== menuPosition.x || y !== menuPosition.y) {
        setMenuPosition({ x, y });
      }
    }
  }, [menuOpen, menuPosition]);

  const activityMeta = getActivityStateMeta(activityState);

  // Common worktree item content
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

  const worktreeItemContent = (
    <>
      {/* Drop indicator - top */}
      {showDropIndicator && dropDirection === 'top' && (
        <div className="absolute -top-0.5 left-2 right-2 h-0.5 rounded-full bg-theme/75" />
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
          'control-panel-muted relative flex w-full flex-col items-start gap-2 rounded-xl p-3 text-left transition-all cursor-pointer',
          isPrunable && 'opacity-50',
          isActive
            ? 'border-theme/22 bg-theme/10 text-foreground'
            : 'hover:border-theme/16 hover:bg-theme/8'
        )}
      >
        {isActive && (
          <motion.div
            layoutId="worktree-panel-highlight"
            className="absolute inset-0 rounded-xl border border-theme/18 bg-theme/6"
            transition={springFast}
          />
        )}
        {/* Branch name */}
        <div className="relative z-10 flex w-full items-start gap-2">
          <button
            ref={menuTriggerRef}
            type="button"
            onClick={onClick}
            className="min-w-0 flex flex-1 flex-col items-start gap-2 rounded-[inherit] text-left outline-none"
          >
            <div className="flex w-full items-start gap-2">
              <GitBranch
                className={cn(
                  'mt-0.5 h-4 w-4 shrink-0',
                  isPrunable
                    ? 'text-destructive'
                    : isActive
                      ? 'text-foreground'
                      : 'text-muted-foreground'
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={cn('truncate font-medium', isPrunable && 'line-through')}>
                    {branchDisplay}
                  </span>
                  {isPrunable ? (
                    <span className="control-chip shrink-0 bg-destructive/10 text-destructive">
                      {t('Deleted')}
                    </span>
                  ) : isMain ? (
                    <span className="control-chip control-chip-strong shrink-0">{t('Main')}</span>
                  ) : isMerged ? (
                    <span className="control-chip control-chip-done shrink-0">{t('Merged')}</span>
                  ) : null}
                </div>
                <div
                  className={cn(
                    'mt-1 overflow-hidden whitespace-nowrap text-ellipsis text-xs leading-5 [text-align:left] [unicode-bidi:plaintext]',
                    useLtrPathDisplay ? '[direction:ltr]' : '[direction:rtl]',
                    isPrunable && 'line-through',
                    isActive ? 'text-foreground/72' : 'text-muted-foreground'
                  )}
                  title={displayWorktreePath}
                >
                  {displayWorktreePath}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 pl-6 text-xs text-muted-foreground">
              {activityState !== 'idle' && (
                <span className={cn('control-chip', activityMeta.chipClassName)}>
                  <ActivityIndicator state={activityState} size="sm" />
                  {activityMeta.label}
                </span>
              )}
              {activity.agentCount > 0 && (
                <span className="control-chip">
                  <Sparkles className="h-3 w-3" />
                  {activity.agentCount}
                </span>
              )}
              {activity.terminalCount > 0 && (
                <span className="control-chip">
                  <Terminal className="h-3 w-3" />
                  {activity.terminalCount}
                </span>
              )}
              {hasDiffStats && (
                <span className="control-chip">
                  {diffStats.insertions > 0 && (
                    <span className="text-[color:var(--success)]">+{diffStats.insertions}</span>
                  )}
                  {diffStats.deletions > 0 && (
                    <span className="text-destructive">-{diffStats.deletions}</span>
                  )}
                </span>
              )}
            </div>
          </button>

          <div className="relative z-10 shrink-0 pl-1 pt-0.5">
            <GitSyncButton
              ahead={ahead}
              behind={behind}
              tracking={tracking}
              currentBranch={currentBranch}
              isSyncing={isSyncing}
              onSync={handleSync}
              onPublish={handlePublish}
            />
          </div>
        </div>
      </div>
      {/* Drop indicator - bottom */}
      {showDropIndicator && dropDirection === 'bottom' && (
        <div className="absolute -bottom-0.5 left-2 right-2 h-0.5 rounded-full bg-theme/75" />
      )}
    </>
  );

  return (
    <>
      {glowEnabled ? (
        <GlowBorder state={outputState as GlowState} className="rounded-lg">
          {worktreeItemContent}
        </GlowBorder>
      ) : (
        <div className="relative rounded-lg">{worktreeItemContent}</div>
      )}

      {/* Context Menu */}
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
            {/* Close All Sessions */}
            {activity.agentCount > 0 && activity.terminalCount > 0 && (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-theme/10"
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

            {/* Close Agent Sessions */}
            {activity.agentCount > 0 && (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-theme/10"
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

            {/* Close Terminal Sessions */}
            {activity.terminalCount > 0 && (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-theme/10"
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

            {/* Separator if there are activity options */}
            {hasActivity && <div className="my-1 h-px bg-border" />}

            {/* Open Folder */}
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-theme/10"
              onClick={() => {
                setMenuOpen(false);
                window.electronAPI.shell.openPath(worktree.path);
              }}
              role="menuitem"
            >
              <FolderOpen className="h-4 w-4" />
              {t('Open folder')}
            </button>

            {/* Copy Path */}
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-theme/10"
              onClick={() => {
                setMenuOpen(false);
                handleCopyPath();
              }}
              role="menuitem"
            >
              <Copy className="h-4 w-4" />
              {t('Copy Path')}
            </button>

            {/* Merge to Branch */}
            {onMerge && !isMain && !isPrunable && (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-theme/10"
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

            {/* Separator before delete */}
            <div className="my-1 h-px bg-border" />

            {/* Delete Worktree */}
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive transition-colors hover:bg-destructive/10',
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

function WorktreeItemSkeleton() {
  return (
    <div className="control-panel rounded-xl p-3">
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 animate-pulse rounded bg-muted" />
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
      </div>
      <div className="mt-2 h-3 w-48 animate-pulse rounded bg-muted" />
      <div className="mt-2 h-3 w-32 animate-pulse rounded bg-muted" />
    </div>
  );
}
