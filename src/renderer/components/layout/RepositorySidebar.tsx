import { isWslUncPath } from '@shared/utils/path';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import {
  ChevronRight,
  Clock,
  FolderGit2,
  FolderMinus,
  FolderOpen,
  PanelLeftClose,
  Plus,
  Search,
  Settings2,
  X,
} from 'lucide-react';
import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { sanitizeGitWorktrees } from '@/lib/worktreeData';
import { useSettingsStore } from '@/stores/settings';
import { useWorktreeActivityStore } from '@/stores/worktreeActivity';
import { CollapsedSidebarRail } from './CollapsedSidebarRail';
import { RunningProjectsPopover } from './RunningProjectsPopover';
import {
  type RepositoryTreeItemRepository as Repository,
  RepositoryTreeItem,
} from './repository-sidebar/RepositoryTreeItem';
import { SidebarEmptyState } from './SidebarEmptyState';
import { buildTreeSidebarWorktreePrefetchInputs } from './sidebarWorktreePrefetchPolicy';

export interface RepositorySidebarProps {
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
  onExpand?: () => void;
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
  tempWorkspaceCount?: number;
  hasActiveTempWorkspace?: boolean;
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
  collapsed = false,
  onCollapse,
  onExpand,
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
  tempWorkspaceCount = 0,
  hasActiveTempWorkspace = false,
}: RepositorySidebarProps) {
  const { t } = useI18n();
  const hideGroups = useSettingsStore((s) => s.hideGroups);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [menuPlacement, setMenuPlacement] = useState<'pointer' | 'anchor-end'>('pointer');
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

  const handleContextMenu = (e: MouseEvent, repo: Repository) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuAnchor(null);
    setMenuPlacement('pointer');
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

  const allRepoPaths = useMemo(() => repositories.map((repo) => repo.path), [repositories]);
  const allRepoWorktreePrefetchInputs = useMemo(
    () =>
      buildTreeSidebarWorktreePrefetchInputs({
        allRepoPaths,
        hasActiveFilter: parsedSearch.hasActiveFilter,
        canLoadRepo,
      }),
    [allRepoPaths, parsedSearch.hasActiveFilter, canLoadRepo]
  );
  const { worktreesMap: allRepoWorktreesMap } = useWorktreeListMultiple(
    allRepoWorktreePrefetchInputs
  );

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

        const repoWorktrees = sanitizeGitWorktrees(allRepoWorktreesMap[repo.path] || []);
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

  const handleOpenRepoActions = useCallback(
    (event: MouseEvent<HTMLButtonElement>, repo: Repository) => {
      event.stopPropagation();
      setMenuAnchor(event.currentTarget);
      const rect = event.currentTarget.getBoundingClientRect();
      setMenuPlacement('anchor-end');
      setMenuPosition({
        x: Math.round(rect.right),
        y: Math.round(rect.bottom + 6),
      });
      setMenuRepo(repo);
      setMenuOpen(true);
    },
    []
  );

  const sidebarBody = collapsed ? (
    <CollapsedSidebarRail
      label="Repository Sidebar"
      triggerTitle={t('Repository sidebar actions')}
      icon={FolderGit2}
      popupClassName="min-w-[196px]"
      actions={[
        {
          id: 'expand-repository',
          label: t('Expand Repository'),
          icon: FolderOpen,
          onSelect: () => onExpand?.(),
          disabled: !onExpand,
        },
        {
          id: 'add-repository',
          label: t('Add Repository'),
          icon: Plus,
          onSelect: onAddRepository,
          separatorBefore: true,
        },
      ]}
    />
  ) : (
    <aside
      className={cn(
        'control-sidebar flex h-full w-full flex-col border-r bg-background transition-colors',
        isFileDragOver && 'bg-theme/8'
      )}
    >
      {/* Header */}
      <div className="control-sidebar-header drag-region">
        <div className="control-sidebar-heading no-drag" aria-hidden="true" />
        <div className="control-sidebar-toolbar no-drag">
          <div className="control-sidebar-toolbar-group">
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
            aria-label={t('Search projects')}
            placeholder={t('Search projects')}
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
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-1.5 py-1.5">
        {temporaryWorkspaceEnabled && (
          <div className="mb-2">
            <button
              type="button"
              onClick={() => onSelectRepo(TEMP_REPO_ID)}
              className="control-tree-node group relative flex w-full flex-col items-start gap-0.5 px-2 py-1 text-left transition-colors"
              data-active={selectedRepo === TEMP_REPO_ID ? 'repo' : 'false'}
              data-selection-tone={hasActiveTempWorkspace ? 'context' : 'default'}
              aria-current={selectedRepo === TEMP_REPO_ID ? 'page' : undefined}
            >
              <div className="control-tree-row relative z-10">
                <span className="control-tree-glyph h-4 w-4 shrink-0">
                  <Clock className="control-tree-icon h-4 w-4" />
                </span>
                <div className="control-tree-text-stack">
                  <span className="control-tree-title min-w-0 block truncate">
                    {t('Temp Sessions')}
                  </span>
                  <span
                    className={cn(
                      'control-tree-subtitle overflow-hidden whitespace-nowrap text-ellipsis [unicode-bidi:plaintext]',
                      tempBasePath && isWslUncPath(tempBasePath)
                        ? '[direction:ltr]'
                        : '[direction:rtl]'
                    )}
                  >
                    {tempBasePath || t('Quick scratch sessions')}
                  </span>
                  {tempWorkspaceCount > 0 ? (
                    <div className="control-tree-meta control-tree-meta-row">
                      <span className="control-tree-metric">
                        <span className="control-tree-metric-value">{tempWorkspaceCount}</span>
                        <span className="control-tree-metric-label">sessions</span>
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            </button>
          </div>
        )}
        {filteredRepos.length === 0 && hasSearchFilter ? (
          <div className="flex h-full items-start justify-start px-2 py-3">
            <SidebarEmptyState
              icon={<Search className="h-4.5 w-4.5" />}
              label={t('Filtered View')}
              title={t('No matches')}
              description={t(
                'No projects match the current search. Try a broader term or clear the filter.'
              )}
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
              <div className="control-tree-section-list">
                {groupedSections.map((section) => {
                  const isCollapsed = !!collapsedGroups[section.groupId];
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
                          <span className="control-section-marker" aria-hidden="true">
                            {section.emoji}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate text-left">{section.name}</span>
                        <span className="control-section-count" aria-hidden="true">
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
                            <div className="control-tree-section-body">
                              {section.repos.map(({ repo, originalIndex }) => (
                                <RepositoryTreeItem
                                  key={repo.path}
                                  repo={repo}
                                  originalIndex={originalIndex}
                                  sectionGroupId={section.groupId}
                                  selectedRepo={selectedRepo}
                                  allRepoWorktreesMap={allRepoWorktreesMap}
                                  activePathSet={activePathSet}
                                  searchQuery={searchQuery}
                                  dropTargetIndex={dropTargetIndex}
                                  draggedIndex={draggedIndexRef.current}
                                  onDragStart={handleDragStart}
                                  onDragEnd={handleDragEnd}
                                  onDragOver={handleDragOver}
                                  onDragLeave={handleDragLeave}
                                  onDrop={handleDrop}
                                  onContextMenu={handleContextMenu}
                                  onSelectRepo={onSelectRepo}
                                  onOpenActions={handleOpenRepoActions}
                                  t={t}
                                />
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="control-tree-flat-list">
                {filteredRepos.map(({ repo, originalIndex }) => (
                  <RepositoryTreeItem
                    key={repo.path}
                    repo={repo}
                    originalIndex={originalIndex}
                    selectedRepo={selectedRepo}
                    allRepoWorktreesMap={allRepoWorktreesMap}
                    activePathSet={activePathSet}
                    searchQuery={searchQuery}
                    dropTargetIndex={dropTargetIndex}
                    draggedIndex={draggedIndexRef.current}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onContextMenu={handleContextMenu}
                    onSelectRepo={onSelectRepo}
                    onOpenActions={handleOpenRepoActions}
                    t={t}
                  />
                ))}
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
    </aside>
  );

  return (
    <>
      {sidebarBody}

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
            className="control-menu fixed z-50 min-w-32 rounded-lg p-1"
            style={{
              left: menuPosition.x,
              top: menuPosition.y,
              transform: menuPlacement === 'anchor-end' ? 'translateX(-100%)' : undefined,
            }}
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
              className="control-menu-item flex w-full items-center gap-2 rounded-md px-2 py-1.5"
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
              className="control-menu-item control-menu-item-danger flex w-full items-center gap-2 rounded-md px-2 py-1.5"
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
    </>
  );
}
