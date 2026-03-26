import { getDisplayPath, isWslUncPath } from '@shared/utils/path';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import {
  ChevronRight,
  Clock,
  FolderGit2,
  FolderMinus,
  MoreHorizontal,
  PanelLeftClose,
  Plus,
  Search,
  Settings2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ALL_GROUP_ID,
  type RepositoryGroup,
  type TabId,
  TEMP_REPO_ID,
  UNGROUPED_SECTION_ID,
} from '@/App/constants';
import {
  getStoredGroupCollapsedState,
  normalizePath,
  saveGroupCollapsedState,
} from '@/App/storage';
import {
  CreateGroupDialog,
  GroupEditDialog,
  GroupSelector,
  MoveToGroupSubmenu,
} from '@/components/group';
import { RepositorySettingsDialog } from '@/components/repository/RepositorySettingsDialog';
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
import { useWorktreeListMultiple } from '@/hooks/useWorktree';
import { useI18n } from '@/i18n';
import { buildRemovalDialogCopy } from '@/lib/feedbackCopy';
import { focusFirstMenuItem, handleMenuNavigationKeyDown } from '@/lib/menuA11y';
import { heightVariants, springStandard } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';
import { useWorktreeActivityStore } from '@/stores/worktreeActivity';
import { RunningProjectsPopover } from './RunningProjectsPopover';
import { SidebarEmptyState } from './SidebarEmptyState';

interface Repository {
  name: string;
  path: string;
  groupId?: string;
}

interface RepositorySidebarProps {
  repositories: Repository[];
  selectedRepo: string | null;
  onSelectRepo: (repoPath: string, options?: { activateRemote?: boolean }) => void;
  canLoadRepo: (repoPath: string) => boolean;
  onAddRepository: () => void;
  onRemoveRepository?: (repoPath: string) => void;
  onReorderRepositories?: (fromIndex: number, toIndex: number) => void;
  onOpenSettings?: () => void;
  isSettingsActive?: boolean;
  onToggleSettings?: () => void;
  collapsed?: boolean;
  onCollapse?: () => void;
  groups: RepositoryGroup[];
  activeGroupId: string;
  onSwitchGroup: (groupId: string) => void;
  onCreateGroup: (name: string, emoji: string, color: string) => RepositoryGroup;
  onUpdateGroup: (groupId: string, name: string, emoji: string, color: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onMoveToGroup?: (repoPath: string, groupId: string | null) => void;
  onSwitchTab?: (tab: TabId) => void;
  onSwitchWorktreeByPath?: (path: string) => Promise<void> | void;
  /** Whether a file is being dragged over the sidebar (from App.tsx global handler) */
  isFileDragOver?: boolean;
  temporaryWorkspaceEnabled?: boolean;
  tempBasePath?: string;
}

export function RepositorySidebar({
  repositories,
  selectedRepo,
  onSelectRepo,
  canLoadRepo,
  onAddRepository,
  onRemoveRepository,
  onReorderRepositories,
  onOpenSettings: _onOpenSettings,
  isSettingsActive: _isSettingsActive,
  onToggleSettings: _onToggleSettings,
  collapsed: _collapsed = false,
  onCollapse,
  groups,
  activeGroupId,
  onSwitchGroup,
  onCreateGroup,
  onUpdateGroup,
  onDeleteGroup,
  onMoveToGroup,
  onSwitchTab,
  onSwitchWorktreeByPath,
  isFileDragOver,
  temporaryWorkspaceEnabled = false,
  tempBasePath = '',
}: RepositorySidebarProps) {
  const { t } = useI18n();
  const _settingsDisplayMode = useSettingsStore((s) => s.settingsDisplayMode);
  const hideGroups = useSettingsStore((s) => s.hideGroups);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [menuRepo, setMenuRepo] = useState<Repository | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [repoToRemove, setRepoToRemove] = useState<Repository | null>(null);
  const removeDialogCopy = repoToRemove
    ? buildRemovalDialogCopy({ kind: 'repository', name: repoToRemove.name }, t)
    : null;
  const [repoSettingsOpen, setRepoSettingsOpen] = useState(false);
  const [repoSettingsTarget, setRepoSettingsTarget] = useState<Repository | null>(null);
  const [createGroupDialogOpen, setCreateGroupDialogOpen] = useState(false);
  const [editGroupDialogOpen, setEditGroupDialogOpen] = useState(false);

  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() =>
    getStoredGroupCollapsedState()
  );

  const toggleGroupCollapsed = useCallback((groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = { ...prev, [groupId]: !prev[groupId] };
      saveGroupCollapsedState(next);
      return next;
    });
  }, []);

  const activeGroup = groups.find((g) => g.id === activeGroupId);
  const repositoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const group of groups) {
      counts[group.id] = repositories.filter((r) => r.groupId === group.id).length;
    }
    return counts;
  }, [groups, repositories]);

  // Drag reorder
  const draggedIndexRef = useRef<number | null>(null);
  const dragImageRef = useRef<HTMLDivElement | null>(null);
  const dragGroupRef = useRef<string | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, index: number, repo: Repository) => {
    draggedIndexRef.current = index;
    dragGroupRef.current = repo.groupId ?? UNGROUPED_SECTION_ID;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));

    // Create styled drag image
    const dragImage = document.createElement('div');
    dragImage.textContent = repo.name;
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
  }, []);

  const handleDragEnd = useCallback(() => {
    if (dragImageRef.current) {
      document.body.removeChild(dragImageRef.current);
      dragImageRef.current = null;
    }
    draggedIndexRef.current = null;
    dragGroupRef.current = null;
    setDropTargetIndex(null);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number, targetGroupId?: string) => {
      const canDropInGroup = !targetGroupId || dragGroupRef.current === targetGroupId;
      if (!canDropInGroup) {
        setDropTargetIndex(null);
        return;
      }

      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (draggedIndexRef.current !== null && draggedIndexRef.current !== index) {
        setDropTargetIndex(index);
      }
    },
    []
  );

  const handleDragLeave = useCallback(() => {
    setDropTargetIndex(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, toIndex: number, targetGroupId?: string) => {
      const canDropInGroup = !targetGroupId || dragGroupRef.current === targetGroupId;
      if (!canDropInGroup) {
        setDropTargetIndex(null);
        return;
      }

      e.preventDefault();
      const fromIndex = draggedIndexRef.current;
      if (fromIndex !== null && fromIndex !== toIndex && onReorderRepositories) {
        onReorderRepositories(fromIndex, toIndex);
      }
      setDropTargetIndex(null);
    },
    [onReorderRepositories]
  );

  const handleContextMenu = (e: React.MouseEvent, repo: Repository) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuAnchor(null);
    setMenuPosition({ x: e.clientX, y: e.clientY });
    setMenuRepo(repo);
    setMenuOpen(true);
  };

  useEffect(() => {
    if (menuOpen && menuRef.current) {
      focusFirstMenuItem(menuRef.current);
    }
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) {
      menuAnchor?.focus();
    }
  }, [menuAnchor, menuOpen]);

  const handleRemoveClick = () => {
    if (menuRepo) {
      setRepoToRemove(menuRepo);
    }
    setMenuOpen(false);
  };

  const handleConfirmRemove = () => {
    if (repoToRemove && onRemoveRepository) {
      onRemoveRepository(repoToRemove.path);
    }
    setRepoToRemove(null);
  };

  const allRepoPaths = useMemo(() => repositories.map((repo) => repo.path), [repositories]);
  const { worktreesMap: allRepoWorktreesMap } = useWorktreeListMultiple(
    useMemo(
      () =>
        allRepoPaths.map((repoPath) => ({
          repoPath,
          // Do not query unopened remote repos during startup/search; that would trigger SSH auth.
          enabled: canLoadRepo(repoPath),
        })),
      [allRepoPaths, canLoadRepo]
    )
  );
  const activities = useWorktreeActivityStore((s) => s.activities);
  const activePathSet = useMemo(
    () =>
      new Set(
        Object.entries(activities)
          .filter(([, activity]) => activity.agentCount > 0 || activity.terminalCount > 0)
          .map(([path]) => normalizePath(path))
      ),
    [activities]
  );

  /**
   * 解析搜索语法：当前仅支持 `:active`，其余内容继续作为仓库名称搜索词。
   */
  const parsedSearch = useMemo(() => {
    const tokens = searchQuery.trim().split(/\s+/).filter(Boolean);
    const textTokens: string[] = [];
    let hasActiveFilter = false;

    for (const token of tokens) {
      if (token.toLowerCase() === ':active') {
        hasActiveFilter = true;
        continue;
      }
      textTokens.push(token);
    }

    return {
      hasActiveFilter,
      textQuery: textTokens.join(' ').toLowerCase(),
    };
  }, [searchQuery]);

  // Filter by group and search
  const hasSearchFilter = parsedSearch.hasActiveFilter || parsedSearch.textQuery.length > 0;
  const showSections = activeGroupId === ALL_GROUP_ID && !hasSearchFilter && !hideGroups;

  const filteredRepos = useMemo(() => {
    let filtered = repositories;
    if (activeGroupId !== ALL_GROUP_ID) {
      filtered = filtered.filter((r) => r.groupId === activeGroupId);
    }
    if (parsedSearch.hasActiveFilter) {
      filtered = filtered.filter((repo) => {
        const normalizedRepoPath = normalizePath(repo.path);
        if (activePathSet.has(normalizedRepoPath)) return true;

        const repoWorktrees = allRepoWorktreesMap[repo.path] || [];
        return repoWorktrees.some((worktree) => activePathSet.has(normalizePath(worktree.path)));
      });
    }
    if (parsedSearch.textQuery) {
      filtered = filtered.filter((repo) =>
        repo.name.toLowerCase().includes(parsedSearch.textQuery)
      );
    }
    return filtered.map((repo) => ({
      repo,
      originalIndex: repositories.indexOf(repo),
    }));
  }, [repositories, activeGroupId, parsedSearch, activePathSet, allRepoWorktreesMap]);

  const groupedSections = useMemo(() => {
    if (!showSections) return [];

    const sections: Array<{
      groupId: string;
      name: string;
      emoji: string;
      color: string;
      repos: Array<{ repo: Repository; originalIndex: number }>;
    }> = [];

    // Build sections for each group (in order)
    const sortedGroups = [...groups].sort((a, b) => a.order - b.order);
    for (const group of sortedGroups) {
      const groupRepos = repositories
        .filter((r) => r.groupId === group.id)
        .map((repo) => ({ repo, originalIndex: repositories.indexOf(repo) }));
      if (groupRepos.length > 0) {
        sections.push({
          groupId: group.id,
          name: group.name,
          emoji: group.emoji,
          color: group.color,
          repos: groupRepos,
        });
      }
    }

    // Ungrouped section
    const ungroupedRepos = repositories
      .filter((r) => !r.groupId)
      .map((repo) => ({ repo, originalIndex: repositories.indexOf(repo) }));
    if (ungroupedRepos.length > 0) {
      sections.push({
        groupId: UNGROUPED_SECTION_ID,
        name: t('Ungrouped'),
        emoji: '',
        color: '',
        repos: ungroupedRepos,
      });
    }

    return sections;
  }, [showSections, groups, repositories, t]);

  const renderRepoItem = (repo: Repository, originalIndex: number, sectionGroupId?: string) => {
    const isSelected = selectedRepo === repo.path;
    const displayRepoPath = getDisplayPath(repo.path);
    const useLtrPathDisplay = isWslUncPath(displayRepoPath);
    const repoWorktrees = allRepoWorktreesMap[repo.path] || [];
    const activeWorktreeCount = repoWorktrees.filter((worktree) =>
      activePathSet.has(normalizePath(worktree.path))
    ).length;
    return (
      <div key={repo.path} className="relative">
        {/* Drop indicator - top */}
        {dropTargetIndex === originalIndex &&
          draggedIndexRef.current !== null &&
          draggedIndexRef.current > originalIndex && (
            <div className="absolute -top-0.5 left-2 right-2 h-0.5 rounded-full bg-theme/75" />
          )}
        <div
          draggable={!searchQuery}
          onDragStart={(e) => handleDragStart(e, originalIndex, repo)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleDragOver(e, originalIndex, sectionGroupId)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, originalIndex, sectionGroupId)}
          onContextMenu={(e) => handleContextMenu(e, repo)}
          className={cn(
            'control-tree-node group relative flex w-full flex-col items-start gap-0.5 px-2 py-1 text-left transition-colors',
            draggedIndexRef.current === originalIndex && 'opacity-50'
          )}
          data-active={isSelected ? 'repo' : 'false'}
        >
          <div className="relative z-10 flex w-full items-start gap-1.5">
            <button
              type="button"
              className="flex min-w-0 flex-1 items-start gap-1.5 text-left outline-none"
              onClick={() => onSelectRepo(repo.path, { activateRemote: true })}
              aria-current={isSelected ? 'page' : undefined}
            >
              <span className="control-tree-glyph mt-0.5 h-4 w-4 shrink-0">
                <FolderGit2 className="control-tree-icon h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="control-tree-title min-w-0 flex-1 truncate">{repo.name}</span>
                  {(isSelected || activeWorktreeCount > 0) &&
                    (repoWorktrees.length > 0 || activeWorktreeCount > 0) && (
                      <span className="control-tree-meta control-tree-meta-row shrink-0">
                        {repoWorktrees.length > 0 ? (
                          <span className="control-tree-count">{repoWorktrees.length} trees</span>
                        ) : null}
                        {repoWorktrees.length > 0 && activeWorktreeCount > 0 ? (
                          <span className="control-tree-separator">·</span>
                        ) : null}
                        {activeWorktreeCount > 0 ? (
                          <span className="control-tree-count control-tree-count-live">
                            {activeWorktreeCount} live
                          </span>
                        ) : null}
                      </span>
                    )}
                </div>
                <div
                  className={cn(
                    'control-tree-subtitle mt-px w-full overflow-hidden whitespace-nowrap text-ellipsis [text-align:left]',
                    useLtrPathDisplay ? '[direction:ltr]' : '[direction:rtl]'
                  )}
                  title={displayRepoPath}
                >
                  {displayRepoPath}
                </div>
              </div>
            </button>
            <button
              type="button"
              className="control-tree-action flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-theme/10 hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                setMenuAnchor(e.currentTarget);
                const rect = e.currentTarget.getBoundingClientRect();
                setMenuPosition({
                  x: Math.max(8, Math.round(rect.right - 176)),
                  y: Math.round(rect.bottom + 6),
                });
                setMenuRepo(repo);
                setMenuOpen(true);
              }}
              aria-label={t('Repository actions')}
              title={t('Repository actions')}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {/* Drop indicator - bottom */}
        {dropTargetIndex === originalIndex &&
          draggedIndexRef.current !== null &&
          draggedIndexRef.current < originalIndex && (
            <div className="absolute -bottom-0.5 left-2 right-2 h-0.5 rounded-full bg-theme/75" />
          )}
      </div>
    );
  };

  return (
    <aside
      className={cn(
        'control-sidebar flex h-full w-full flex-col border-r bg-background transition-colors',
        isFileDragOver && 'bg-theme/8'
      )}
    >
      {/* Header */}
      <div className="control-sidebar-header drag-region">
        <div className="control-sidebar-heading no-drag">
          <div className="control-sidebar-heading-copy">
            <span className="control-sidebar-title">{t('Repositories')}</span>
            <span className="control-sidebar-subtitle">
              {activeGroup?.name ?? t('All repositories')}
            </span>
          </div>
          <span className="control-sidebar-count">{filteredRepos.length}</span>
        </div>
        <div className="control-sidebar-toolbar no-drag">
          {onSwitchWorktreeByPath && (
            <RunningProjectsPopover
              onSelectWorktreeByPath={onSwitchWorktreeByPath}
              onSwitchTab={onSwitchTab}
            />
          )}
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

      {/* Group Selector - only show when groups are not hidden */}
      <div className="control-sidebar-strip">
        {!hideGroups && (
          <GroupSelector
            groups={groups}
            activeGroupId={activeGroupId}
            repositoryCounts={repositoryCounts}
            totalCount={repositories.length}
            onSelectGroup={onSwitchGroup}
            onEditGroup={() => setEditGroupDialogOpen(true)}
            onAddGroup={() => setCreateGroupDialogOpen(true)}
          />
        )}

        <div className="control-sidebar-filter control-sidebar-search">
          <Search className="control-sidebar-search-icon h-3.5 w-3.5" />
          <input
            ref={searchInputRef}
            type="text"
            aria-label={t('Search repositories')}
            placeholder={`${t('Search repositories')} (:active)`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="control-sidebar-search-input"
          />
          {searchQuery.length > 0 && (
            <button
              type="button"
              className="control-sidebar-search-clear"
              onClick={() => {
                setSearchQuery('');
                searchInputRef.current?.focus();
              }}
              aria-label={t('Clear search')}
              title={t('Clear')}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Repository List */}
      <div className="flex-1 overflow-auto px-1.5 py-1.5">
        {temporaryWorkspaceEnabled && (
          <div className="mb-1.5">
            <button
              type="button"
              onClick={() => onSelectRepo(TEMP_REPO_ID)}
              className="control-tree-node group relative flex w-full flex-col items-start gap-0.5 px-2 py-1 text-left transition-colors"
              data-active={selectedRepo === TEMP_REPO_ID ? 'repo' : 'false'}
              aria-current={selectedRepo === TEMP_REPO_ID ? 'page' : undefined}
            >
              <div className="relative z-10 flex w-full items-center gap-1.5">
                <span className="control-tree-glyph h-4 w-4 shrink-0">
                  <Clock className="control-tree-icon h-4 w-4" />
                </span>
                <span className="control-tree-title min-w-0 flex-1 truncate">
                  {t('Temp Session')}
                </span>
              </div>
              <span
                className={cn(
                  'control-tree-subtitle relative z-10 mt-px overflow-hidden whitespace-nowrap text-ellipsis pl-[1.375rem] [unicode-bidi:plaintext]',
                  tempBasePath && isWslUncPath(tempBasePath) ? '[direction:ltr]' : '[direction:rtl]'
                )}
              >
                {tempBasePath || t('Quick scratch sessions')}
              </span>
            </button>
          </div>
        )}
        {filteredRepos.length === 0 && hasSearchFilter ? (
          <div className="flex h-full items-start justify-start px-2 py-3">
            <SidebarEmptyState
              icon={<Search className="h-4.5 w-4.5" />}
              label={t('Filtered View')}
              title={t('No matches')}
              description={t('Try a broader search or clear the current filter.')}
              meta={t('Filter: {{query}}', {
                query: searchQuery.trim() || t('Search query'),
              })}
              actions={
                <Button
                  variant="outline"
                  size="sm"
                  className="control-action-button control-action-button-secondary h-8 rounded-lg px-3 text-sm"
                  onClick={() => {
                    setSearchQuery('');
                    searchInputRef.current?.focus();
                  }}
                >
                  {t('Clear Search')}
                </Button>
              }
            />
          </div>
        ) : repositories.length === 0 ? (
          <div className="flex h-full items-start justify-start px-2 py-3">
            <SidebarEmptyState
              icon={<FolderGit2 className="h-4.5 w-4.5" />}
              label={t('Getting Started')}
              title={t('No repositories yet')}
              description={t(
                'Add one to start switching context, browsing worktrees, and opening operational surfaces.'
              )}
              actions={
                <Button
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onAddRepository();
                  }}
                  variant="default"
                  size="sm"
                  className="control-action-button control-action-button-primary min-w-0 rounded-lg px-3.5 text-sm font-semibold tracking-[-0.01em]"
                >
                  <Plus className="h-4 w-4" />
                  {t('Add Repository')}
                </Button>
              }
            />
          </div>
        ) : (
          <LayoutGroup>
            {showSections ? (
              <div className="space-y-1.5">
                {groupedSections.map((section) => {
                  const isCollapsed = !!collapsedGroups[section.groupId];
                  const isUngrouped = section.groupId === UNGROUPED_SECTION_ID;
                  return (
                    <div key={section.groupId}>
                      {/* Section Header */}
                      <button
                        type="button"
                        onClick={() => toggleGroupCollapsed(section.groupId)}
                        className="control-section-header select-none"
                        aria-expanded={!isCollapsed}
                        aria-controls={`repository-section-${section.groupId}`}
                      >
                        <ChevronRight
                          className={cn(
                            'h-3 w-3 shrink-0 transition-transform duration-150',
                            !isCollapsed && 'rotate-90'
                          )}
                        />
                        {section.emoji && (
                          <span className="shrink-0 text-[12px]">{section.emoji}</span>
                        )}
                        {!isUngrouped && section.color && (
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: section.color }}
                          />
                        )}
                        <span className="min-w-0 flex-1 truncate text-left">{section.name}</span>
                        <span className="shrink-0 text-[10px] tracking-[0.08em] text-muted-foreground/65">
                          {section.repos.length}
                        </span>
                      </button>
                      {/* Section Content */}
                      <AnimatePresence initial={false}>
                        {!isCollapsed && (
                          <motion.div
                            key={`content-${section.groupId}`}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            variants={heightVariants}
                            transition={springStandard}
                            className="overflow-hidden"
                            id={`repository-section-${section.groupId}`}
                          >
                            <div className="space-y-1 pt-0.5">
                              {section.repos.map(({ repo, originalIndex }) =>
                                renderRepoItem(repo, originalIndex, section.groupId)
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-1">
                {filteredRepos.map(({ repo, originalIndex }) =>
                  renderRepoItem(repo, originalIndex)
                )}
              </div>
            )}
          </LayoutGroup>
        )}
      </div>

      {/* Footer */}
      <div className="control-sidebar-footer">
        <button
          type="button"
          className="control-sidebar-footer-action control-sidebar-footer-action-primary"
          onClick={(e) => {
            e.currentTarget.blur();
            onAddRepository();
          }}
        >
          <Plus className="h-4 w-4" />
          {t('Add Repository')}
        </button>
      </div>

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
            className="fixed z-50 min-w-32 rounded-lg border bg-popover p-1 shadow-lg"
            style={{ left: menuPosition.x, top: menuPosition.y }}
            role="menu"
            aria-label={t('Repository actions')}
            onKeyDown={(e) => handleMenuNavigationKeyDown(e, () => setMenuOpen(false))}
          >
            {/* Move to Group - only show when groups are not hidden */}
            {!hideGroups && onMoveToGroup && groups.length > 0 && (
              <MoveToGroupSubmenu
                groups={groups}
                currentGroupId={menuRepo?.groupId}
                onMove={(groupId) => {
                  if (menuRepo) {
                    onMoveToGroup(menuRepo.path, groupId);
                  }
                }}
                onClose={() => setMenuOpen(false)}
              />
            )}

            {!hideGroups && onMoveToGroup && groups.length > 0 && (
              <div className="my-1 h-px bg-border" />
            )}

            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-theme/10"
              onClick={() => {
                setMenuOpen(false);
                if (menuRepo) {
                  setRepoSettingsTarget(menuRepo);
                  setRepoSettingsOpen(true);
                }
              }}
              role="menuitem"
            >
              <Settings2 className="h-4 w-4" />
              {t('Repository Settings')}
            </button>

            <div className="my-1 h-px bg-border" />

            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive transition-colors hover:bg-destructive/10"
              onClick={handleRemoveClick}
              role="menuitem"
            >
              <FolderMinus className="h-4 w-4" />
              {t('Remove repository')}
            </button>
          </div>
        </>
      )}

      {/* Remove confirmation dialog */}
      <AlertDialog
        open={!!repoToRemove}
        onOpenChange={(open) => {
          if (!open) {
            setRepoToRemove(null);
          }
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>{removeDialogCopy?.title ?? t('Remove repository')}</AlertDialogTitle>
            <AlertDialogDescription>
              {removeDialogCopy?.description}
              <span className="block mt-2 text-muted-foreground">
                {removeDialogCopy?.consequence}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline">{t('Cancel')}</Button>} />
            <Button variant="destructive" onClick={handleConfirmRemove}>
              {removeDialogCopy?.actionLabel ?? t('Remove repository')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

      {repoSettingsTarget && (
        <RepositorySettingsDialog
          open={repoSettingsOpen}
          onOpenChange={setRepoSettingsOpen}
          repoPath={repoSettingsTarget.path}
          repoName={repoSettingsTarget.name}
        />
      )}

      <CreateGroupDialog
        open={createGroupDialogOpen}
        onOpenChange={setCreateGroupDialogOpen}
        onSubmit={onCreateGroup}
      />

      <GroupEditDialog
        open={editGroupDialogOpen}
        onOpenChange={setEditGroupDialogOpen}
        group={activeGroup || null}
        repositoryCount={activeGroup ? repositoryCounts[activeGroup.id] || 0 : 0}
        onUpdate={onUpdateGroup}
        onDelete={onDeleteGroup}
      />
    </aside>
  );
}
