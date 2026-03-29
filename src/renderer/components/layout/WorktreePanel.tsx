import type {
  GitBranch as GitBranchType,
  GitWorktree,
  RemoteConnectionStatus,
  WorktreeCreateOptions,
} from '@shared/types';
import { getDisplayPath, getDisplayPathBasename } from '@shared/utils/path';
import { LayoutGroup } from 'framer-motion';
import { FolderOpen, GitBranch, PanelLeftClose, Plus, RefreshCw, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizePath } from '@/App/storage';
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
import { CreateWorktreeDialog } from '@/components/worktree/CreateWorktreeDialog';
import { useLiveSubagents } from '@/hooks/useLiveSubagents';
import { useShouldPoll } from '@/hooks/useWindowFocus';
import { useI18n } from '@/i18n';
import { buildRemovalDialogCopy } from '@/lib/feedbackCopy';
import { cn } from '@/lib/utils';
import { buildActiveSessionMapByWorktree } from '@/lib/worktreeAgentSummary';
import { sanitizeGitWorktrees } from '@/lib/worktreeData';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { useWorktreeActivityStore } from '@/stores/worktreeActivity';
import { SidebarEmptyState } from './SidebarEmptyState';
import { WorktreeItem } from './worktree-panel/WorktreeItem';

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
  onOpenAgentThread?: (worktree: GitWorktree, sessionId: string) => void;
  onOpenSubagentTranscript?: (
    worktree: GitWorktree,
    subagent: import('@shared/types').LiveAgentSubagent
  ) => void;
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
  onOpenAgentThread,
  onOpenSubagentTranscript,
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
  const safeWorktrees = useMemo(() => sanitizeGitWorktrees(worktrees), [worktrees]);

  // Keep track of original indices for drag reorder when filtering
  const filteredWorktreesWithIndex = safeWorktrees
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
  const mainWorktree = safeWorktrees.find((wt) => wt.isMainWorktree);
  const workdir = mainWorktree?.path || '';

  const fetchDiffStats = useWorktreeActivityStore((s) => s.fetchDiffStats);
  const allSessions = useAgentSessionsStore((state) => state.sessions);
  const activeIds = useAgentSessionsStore((state) => state.activeIds);
  const activeSessionMap = useMemo(
    () => buildActiveSessionMapByWorktree(allSessions, activeIds),
    [activeIds, allSessions]
  );
  const liveSubagentMap = useLiveSubagents(
    useMemo(() => worktrees.map((worktree) => worktree.path), [worktrees])
  );
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
    if (safeWorktrees.length === 0 || !shouldPoll) return;
    const loadedPaths = safeWorktrees.map((wt) => wt.path);

    if (loadedPaths.length === 0) return;

    fetchDiffStats(loadedPaths);
    const interval = setInterval(() => {
      fetchDiffStats(loadedPaths);
    }, 10000);
    return () => clearInterval(interval);
  }, [safeWorktrees, fetchDiffStats, shouldPoll]);

  return (
    <aside className="control-sidebar flex h-full w-full flex-col border-r bg-background">
      {/* Header */}
      <div className={cn('control-sidebar-header drag-region', repositoryCollapsed && 'pl-[70px]')}>
        <div className="control-sidebar-heading no-drag" aria-hidden="true" />
        <div className="control-sidebar-toolbar no-drag">
          {repositoryCollapsed && onExpandRepository && (
            <button
              type="button"
              className="control-sidebar-toolbutton no-drag"
              onClick={onExpandRepository}
              title={t('Expand Repository')}
            >
              <FolderOpen className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            className="control-sidebar-toolbutton no-drag"
            onClick={onRefresh}
            title={t('Refresh')}
            disabled={inactiveRemote}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          {onCollapse && (
            <button
              type="button"
              className="control-sidebar-toolbutton no-drag"
              onClick={onCollapse}
              title={t('Collapse')}
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Search bar */}
      <div className="control-sidebar-strip">
        <div className="control-sidebar-filter control-sidebar-search">
          <Search className="control-sidebar-search-icon h-3.5 w-3.5" />
          <input
            type="text"
            aria-label={t('Search worktrees')}
            placeholder={t('Search worktrees')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="control-sidebar-search-input"
          />
          {searchQuery.length > 0 && (
            <button
              type="button"
              className="control-sidebar-search-clear"
              onClick={() => setSearchQuery('')}
              aria-label={t('Clear search')}
              title={t('Clear')}
            >
              <X className="h-3 w-3" />
            </button>
          )}
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
            <div className="control-tree-flat-list">
              {filteredWorktreesWithIndex.map(({ worktree, originalIndex }) => (
                <WorktreeItem
                  key={worktree.path}
                  worktree={worktree}
                  branches={branches}
                  activeSession={activeSessionMap.get(normalizePath(worktree.path))}
                  liveSubagents={
                    activeSessionMap.get(normalizePath(worktree.path))?.agentId.startsWith('codex')
                      ? (liveSubagentMap.get(normalizePath(worktree.path)) ?? [])
                      : []
                  }
                  isActive={activeWorktree?.path === worktree.path}
                  onClick={() => onSelectWorktree(worktree)}
                  onOpenAgentThread={(sessionId) => onOpenAgentThread?.(worktree, sessionId)}
                  onOpenSubagentTranscript={(subagent) =>
                    onOpenSubagentTranscript?.(worktree, subagent)
                  }
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
      <div className="control-sidebar-footer">
        <CreateWorktreeDialog
          branches={branches}
          projectName={projectName}
          workdir={workdir}
          isLoading={isCreating}
          onSubmit={onCreateWorktree}
          trigger={
            <button
              type="button"
              className="control-sidebar-footer-action control-sidebar-footer-action-primary"
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
