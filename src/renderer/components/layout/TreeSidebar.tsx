import type {
  GitBranch as GitBranchType,
  GitWorktree,
  TempWorkspaceItem,
  WorktreeCreateOptions,
} from '@shared/types';
import { getDisplayPath, getDisplayPathBasename, isWslUncPath } from '@shared/utils/path';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import {
  ChevronRight,
  Clock,
  Copy,
  EyeOff,
  FolderGit2,
  FolderMinus,
  FolderOpen,
  GitBranch,
  GitMerge,
  List,
  MoreHorizontal,
  PanelLeftClose,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ALL_GROUP_ID,
  type Repository,
  type RepositoryGroup,
  type TabId,
  TEMP_REPO_ID,
  UNGROUPED_SECTION_ID,
} from '@/App/constants';
import {
  DEFAULT_REPOSITORY_SETTINGS,
  getRepositorySettings,
  getStoredGroupCollapsedState,
  getStoredRepositorySettings,
  normalizePath,
  type RepositorySettings,
  saveGroupCollapsedState,
  saveRepositorySettings,
} from '@/App/storage';
import { GitSyncButton } from '@/components/git/GitSyncButton';
import {
  CreateGroupDialog,
  GroupEditDialog,
  GroupSelector,
  MoveToGroupSubmenu,
} from '@/components/group';
import { RepositoryManagerDialog } from '@/components/repository/RepositoryManagerDialog';
import { RepositorySettingsDialog } from '@/components/repository/RepositorySettingsDialog';
import { TempWorkspaceContextMenu } from '@/components/temp-workspace/TempWorkspaceContextMenu';
import { ActivityIndicator } from '@/components/ui/activity-indicator';
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
import { toastManager } from '@/components/ui/toast';
import { CreateWorktreeDialog } from '@/components/worktree/CreateWorktreeDialog';
import { useGitSync } from '@/hooks/useGitSync';
import { useWorktreeOutputState } from '@/hooks/useOutputState';
import { useShouldPoll } from '@/hooks/useWindowFocus';
import { useWorktreeListMultiple } from '@/hooks/useWorktree';
import { useI18n } from '@/i18n';
import {
  buildClipboardToastCopy,
  buildRemovalDialogCopy,
  buildWorkspaceToastCopy,
} from '@/lib/feedbackCopy';
import { focusFirstMenuItem, handleMenuNavigationKeyDown } from '@/lib/menuA11y';
import { heightVariants, springStandard } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';
import { useWorktreeActivityStore } from '@/stores/worktreeActivity';
import { RunningProjectsPopover } from './RunningProjectsPopover';
import { SidebarEmptyState } from './SidebarEmptyState';

function getSidebarSectionId(prefix: string, value: string): string {
  return `${prefix}-${value.replace(/[^a-zA-Z0-9_-]+/g, '-')}`;
}

interface TreeSidebarProps {
  repositories: Repository[];
  selectedRepo: string | null;
  activeWorktree: GitWorktree | null;
  worktrees: GitWorktree[];
  branches: GitBranchType[];
  isLoading?: boolean;
  isCreating?: boolean;
  error?: string | null;
  onSelectRepo: (repoPath: string, options?: { activateRemote?: boolean }) => void;
  canLoadRepo: (repoPath: string) => boolean;
  onActivateRemoteRepo: (repoPath: string) => void;
  onSelectWorktree: (worktree: GitWorktree) => void;
  onAddRepository: () => void;
  onRemoveRepository?: (repoPath: string) => void;
  onCreateWorktree: (options: WorktreeCreateOptions) => Promise<void>;
  onRemoveWorktree: (
    worktree: GitWorktree,
    options?: { deleteBranch?: boolean; force?: boolean }
  ) => void;
  onMergeWorktree?: (worktree: GitWorktree) => void;
  onReorderRepositories?: (fromIndex: number, toIndex: number) => void;
  onReorderWorktrees?: (fromIndex: number, toIndex: number) => void;
  onRefresh: () => void;
  onInitGit?: () => Promise<void>;
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
  temporaryWorkspaceEnabled?: boolean;
  tempWorkspaces?: TempWorkspaceItem[];
  tempBasePath?: string;
  onSelectTempWorkspace?: (path: string) => void;
  onCreateTempWorkspace?: () => void;
  onRequestTempRename?: (id: string) => void;
  onRequestTempDelete?: (id: string) => void;
  /** Ref callback to expose toggleSelectedRepoExpanded function */
  toggleSelectedRepoExpandedRef?: React.MutableRefObject<(() => void) | null>;
  /** Whether a file is being dragged over the sidebar (from App.tsx global handler) */
  isFileDragOver?: boolean;
}

export function TreeSidebar({
  repositories,
  selectedRepo,
  activeWorktree,
  worktrees: _worktrees,
  branches,
  isLoading: _isLoading,
  isCreating,
  error: _error,
  onSelectRepo,
  canLoadRepo,
  onActivateRemoteRepo,
  onSelectWorktree,
  onAddRepository,
  onRemoveRepository,
  onCreateWorktree,
  onRemoveWorktree,
  onMergeWorktree,
  onReorderRepositories,
  onReorderWorktrees,
  onRefresh,
  onInitGit,
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
  temporaryWorkspaceEnabled = false,
  tempWorkspaces = [],
  tempBasePath = '',
  onSelectTempWorkspace,
  onCreateTempWorkspace,
  onRequestTempRename,
  onRequestTempDelete,
  toggleSelectedRepoExpandedRef,
  isFileDragOver,
}: TreeSidebarProps) {
  const { t, tNode } = useI18n();
  const _settingsDisplayMode = useSettingsStore((s) => s.settingsDisplayMode);
  const hideGroups = useSettingsStore((s) => s.hideGroups);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [tempExpanded, setTempExpanded] = useState(true);
  const [expandedRepoList, setExpandedRepoList] = useState<string[]>([]);

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
  const sortedTempWorkspaces = useMemo(
    () => [...tempWorkspaces].sort((a, b) => b.createdAt - a.createdAt),
    [tempWorkspaces]
  );

  // Convert list to set for fast lookups
  const expandedRepos = useMemo(() => new Set(expandedRepoList), [expandedRepoList]);

  // Fetch worktrees for expanded repos only
  const {
    worktreesMap,
    errorsMap,
    loadingMap,
    refetchAll: refetchExpandedWorktrees,
  } = useWorktreeListMultiple(
    expandedRepoList.map((repoPath) => ({
      repoPath,
      enabled: canLoadRepo(repoPath),
    }))
  );
  const allRepoPaths = useMemo(() => repositories.map((repo) => repo.path), [repositories]);
  const { worktreesMap: allRepoWorktreesMap } = useWorktreeListMultiple(
    useMemo(
      () =>
        allRepoPaths.map((repoPath) => ({
          repoPath,
          // Keep startup passive for unopened remote repos; otherwise search can trigger SSH auth.
          enabled: canLoadRepo(repoPath),
        })),
      [allRepoPaths, canLoadRepo]
    )
  );

  // Repository context menu
  const [repoMenuOpen, setRepoMenuOpen] = useState(false);
  const [repoMenuPosition, setRepoMenuPosition] = useState({ x: 0, y: 0 });
  const [repoMenuTarget, setRepoMenuTarget] = useState<Repository | null>(null);
  const [repoToRemove, setRepoToRemove] = useState<Repository | null>(null);
  const repoMenuRef = useRef<HTMLDivElement>(null);
  const [repoMenuAnchor, setRepoMenuAnchor] = useState<HTMLElement | null>(null);

  // Repository settings dialog
  const [repoSettingsOpen, setRepoSettingsOpen] = useState(false);
  const [repoSettingsTarget, setRepoSettingsTarget] = useState<Repository | null>(null);

  // Repository manager dialog
  const [repoManagerOpen, setRepoManagerOpen] = useState(false);

  // Cached repository settings to avoid repeated localStorage reads
  const [repoSettingsMap, setRepoSettingsMap] = useState<Record<string, RepositorySettings>>(
    getStoredRepositorySettings
  );
  const refreshRepoSettings = useCallback(() => {
    setRepoSettingsMap(getStoredRepositorySettings());
  }, []);
  useEffect(() => {
    refreshRepoSettings();
  }, [refreshRepoSettings]);

  // Create worktree dialog (triggered from context menu)
  const [createWorktreeDialogOpen, setCreateWorktreeDialogOpen] = useState(false);
  const [pendingCreateWorktree, setPendingCreateWorktree] = useState(false);
  const [waitingForBranchRefresh, setWaitingForBranchRefresh] = useState(false);

  // Wait for repo switch before triggering branch refresh
  useEffect(() => {
    if (pendingCreateWorktree && selectedRepo === repoMenuTarget?.path) {
      setPendingCreateWorktree(false);
      // Trigger refresh to get branches and worktree list for the new repo
      onRefresh();
      refetchExpandedWorktrees();
      setWaitingForBranchRefresh(true);
    }
  }, [selectedRepo, pendingCreateWorktree, repoMenuTarget, onRefresh, refetchExpandedWorktrees]);

  // Wait for branches to update before opening dialog
  useEffect(() => {
    if (waitingForBranchRefresh && branches.length > 0) {
      // Small delay to ensure branches state is fully updated
      const timer = setTimeout(() => {
        setCreateWorktreeDialogOpen(true);
        setWaitingForBranchRefresh(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [branches, waitingForBranchRefresh]);

  // Worktree delete dialog
  const [worktreeToDelete, setWorktreeToDelete] = useState<GitWorktree | null>(null);
  const [deleteBranch, setDeleteBranch] = useState(false);
  const [forceDelete, setForceDelete] = useState(false);
  const deleteWorktreeName = worktreeToDelete?.branch || t('Detached');
  const removeRepoDialogCopy = repoToRemove
    ? buildRemovalDialogCopy({ kind: 'repository', name: repoToRemove.name }, t)
    : null;
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

  // Drag reorder for repos
  const draggedRepoIndexRef = useRef<number | null>(null);
  const dragImageRef = useRef<HTMLDivElement | null>(null);
  const dragGroupRef = useRef<string | null>(null);
  const [dropRepoTargetIndex, setDropRepoTargetIndex] = useState<number | null>(null);

  // Drag reorder for worktrees
  const draggedWorktreeIndexRef = useRef<number | null>(null);
  const [dropWorktreeTargetIndex, setDropWorktreeTargetIndex] = useState<number | null>(null);

  // Get the main worktree path for git operations (from selected repo's worktrees)
  const selectedRepoWorktrees = selectedRepo ? worktreesMap[selectedRepo] || [] : [];
  const mainWorktree = selectedRepoWorktrees.find((wt) => wt.isMainWorktree);
  const workdir = mainWorktree?.path || selectedRepo || '';

  const fetchDiffStats = useWorktreeActivityStore((s) => s.fetchDiffStats);
  const activities = useWorktreeActivityStore((s) => s.activities);
  const shouldPoll = useShouldPoll();
  const activePathSet = useMemo(
    () =>
      new Set(
        Object.entries(activities)
          .filter(([, activity]) => activity.agentCount > 0 || activity.terminalCount > 0)
          .map(([path]) => normalizePath(path))
      ),
    [activities]
  );

  useEffect(() => {
    const allWorktrees = Object.values(worktreesMap).flat();
    if (allWorktrees.length === 0 || !shouldPoll) return;

    const activePaths = allWorktrees
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
  }, [worktreesMap, activities, fetchDiffStats, shouldPoll]);

  // Auto-expand selected repo (only when selectedRepo changes externally, not from tree click)
  const prevSelectedRepoRef = useRef<string | null>(null);
  const skipAutoExpandRef = useRef(false);
  useEffect(() => {
    if (selectedRepo && selectedRepo !== prevSelectedRepoRef.current) {
      if (selectedRepo === TEMP_REPO_ID) {
        prevSelectedRepoRef.current = selectedRepo;
        return;
      }
      // Skip auto-expand if user explicitly clicked the tree
      if (
        !skipAutoExpandRef.current &&
        !expandedRepos.has(selectedRepo) &&
        canLoadRepo(selectedRepo)
      ) {
        setExpandedRepoList((prev) => [...prev, selectedRepo]);
      }
      skipAutoExpandRef.current = false;
    }
    prevSelectedRepoRef.current = selectedRepo;
  }, [selectedRepo, expandedRepos, canLoadRepo]);

  const toggleRepoExpanded = useCallback(
    (repoPath: string) => {
      const isExpanded = expandedRepos.has(repoPath);
      if (!isExpanded) {
        onActivateRemoteRepo(repoPath);
      }
      setExpandedRepoList((prev) => {
        if (isExpanded) {
          return prev.filter((p) => p !== repoPath);
        }
        return [...prev, repoPath];
      });
    },
    [expandedRepos, onActivateRemoteRepo]
  );

  // Expose toggle function for selected repo via ref
  useEffect(() => {
    if (toggleSelectedRepoExpandedRef) {
      if (!selectedRepo) {
        toggleSelectedRepoExpandedRef.current = null;
      } else if (selectedRepo === TEMP_REPO_ID) {
        toggleSelectedRepoExpandedRef.current = () => setTempExpanded((prev) => !prev);
      } else {
        toggleSelectedRepoExpandedRef.current = () => toggleRepoExpanded(selectedRepo);
      }
    }
    return () => {
      if (toggleSelectedRepoExpandedRef) {
        toggleSelectedRepoExpandedRef.current = null;
      }
    };
  }, [toggleSelectedRepoExpandedRef, selectedRepo, toggleRepoExpanded]);

  // Repository drag handlers
  const handleRepoDragStart = useCallback((e: React.DragEvent, index: number, repo: Repository) => {
    draggedRepoIndexRef.current = index;
    dragGroupRef.current = repo.groupId ?? UNGROUPED_SECTION_ID;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `repo:${index}`);

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

  const handleRepoDragEnd = useCallback(() => {
    if (dragImageRef.current) {
      document.body.removeChild(dragImageRef.current);
      dragImageRef.current = null;
    }
    draggedRepoIndexRef.current = null;
    dragGroupRef.current = null;
    setDropRepoTargetIndex(null);
  }, []);

  const handleRepoDragOver = useCallback(
    (e: React.DragEvent, originalIndex: number, targetGroupId?: string) => {
      const canDropInGroup = !targetGroupId || dragGroupRef.current === targetGroupId;
      if (!canDropInGroup) {
        setDropRepoTargetIndex(null);
        return;
      }

      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (draggedRepoIndexRef.current !== null && draggedRepoIndexRef.current !== originalIndex) {
        setDropRepoTargetIndex(originalIndex);
      }
    },
    []
  );

  const handleRepoDragLeave = useCallback(() => {
    setDropRepoTargetIndex(null);
  }, []);

  const handleRepoDrop = useCallback(
    (e: React.DragEvent, toIndex: number, targetGroupId?: string) => {
      const canDropInGroup = !targetGroupId || dragGroupRef.current === targetGroupId;
      if (!canDropInGroup) {
        setDropRepoTargetIndex(null);
        return;
      }

      e.preventDefault();
      const fromIndex = draggedRepoIndexRef.current;
      if (fromIndex !== null && fromIndex !== toIndex && onReorderRepositories) {
        onReorderRepositories(fromIndex, toIndex);
      }
      setDropRepoTargetIndex(null);
    },
    [onReorderRepositories]
  );

  // Worktree drag handlers
  const handleWorktreeDragStart = useCallback(
    (e: React.DragEvent, index: number, worktree: GitWorktree) => {
      draggedWorktreeIndexRef.current = index;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', `worktree:${index}`);

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

  const handleWorktreeDragEnd = useCallback(() => {
    if (dragImageRef.current) {
      document.body.removeChild(dragImageRef.current);
      dragImageRef.current = null;
    }
    draggedWorktreeIndexRef.current = null;
    setDropWorktreeTargetIndex(null);
  }, []);

  const handleWorktreeDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedWorktreeIndexRef.current !== null && draggedWorktreeIndexRef.current !== index) {
      setDropWorktreeTargetIndex(index);
    }
  }, []);

  const handleWorktreeDragLeave = useCallback(() => {
    setDropWorktreeTargetIndex(null);
  }, []);

  const handleWorktreeDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault();
      const fromIndex = draggedWorktreeIndexRef.current;
      if (fromIndex !== null && fromIndex !== toIndex && onReorderWorktrees) {
        onReorderWorktrees(fromIndex, toIndex);
      }
      setDropWorktreeTargetIndex(null);
    },
    [onReorderWorktrees]
  );

  const openRepoMenu = useCallback(
    (
      repo: Repository,
      options?: { anchor?: HTMLElement | null; position?: { x: number; y: number } }
    ) => {
      setRepoMenuAnchor(options?.anchor ?? null);
      if (options?.anchor) {
        const rect = options.anchor.getBoundingClientRect();
        setRepoMenuPosition({
          x: Math.max(8, Math.round(rect.right - 176)),
          y: Math.round(rect.bottom + 6),
        });
      } else if (options?.position) {
        setRepoMenuPosition(options.position);
      }
      setRepoMenuTarget(repo);
      setRepoMenuOpen(true);
    },
    []
  );

  // Repository context menu
  const handleRepoContextMenu = (e: React.MouseEvent, repo: Repository) => {
    e.preventDefault();
    e.stopPropagation();
    openRepoMenu(repo, { position: { x: e.clientX, y: e.clientY } });
  };

  // Adjust repo menu position if it overflows viewport
  useEffect(() => {
    if (repoMenuOpen && repoMenuRef.current) {
      focusFirstMenuItem(repoMenuRef.current);
      const menu = repoMenuRef.current;
      const rect = menu.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;

      let { x, y } = repoMenuPosition;

      if (y + rect.height > viewportHeight - 8) {
        y = Math.max(8, viewportHeight - rect.height - 8);
      }

      if (x + rect.width > viewportWidth - 8) {
        x = Math.max(8, viewportWidth - rect.width - 8);
      }

      if (x !== repoMenuPosition.x || y !== repoMenuPosition.y) {
        setRepoMenuPosition({ x, y });
      }
    }
  }, [repoMenuOpen, repoMenuPosition]);

  useEffect(() => {
    if (!repoMenuOpen) {
      repoMenuAnchor?.focus();
    }
  }, [repoMenuAnchor, repoMenuOpen]);

  const handleRemoveRepoClick = () => {
    if (repoMenuTarget) {
      setRepoToRemove(repoMenuTarget);
    }
    setRepoMenuOpen(false);
  };

  const handleConfirmRemoveRepo = () => {
    if (repoToRemove && onRemoveRepository) {
      onRemoveRepository(repoToRemove.path);
    }
    setRepoToRemove(null);
  };

  /**
   * 解析搜索语法：当前仅支持 `:active`，其余内容继续作为仓库 / worktree 搜索词。
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

  const hasSearchFilter = parsedSearch.hasActiveFilter || parsedSearch.textQuery.length > 0;
  const showSections = activeGroupId === ALL_GROUP_ID && !hasSearchFilter && !hideGroups;
  const filteredTempWorkspaces = useMemo(() => {
    return sortedTempWorkspaces.filter((item) => {
      const normalizedPath = normalizePath(item.path);
      const activity = activities[normalizedPath] ?? activities[item.path];

      if (parsedSearch.hasActiveFilter) {
        const hasActivity =
          activity !== undefined && (activity.agentCount > 0 || activity.terminalCount > 0);
        if (!hasActivity) return false;
      }

      if (!parsedSearch.textQuery) return true;

      return (
        item.title.toLowerCase().includes(parsedSearch.textQuery) ||
        item.folderName.toLowerCase().includes(parsedSearch.textQuery) ||
        getDisplayPath(item.path).toLowerCase().includes(parsedSearch.textQuery)
      );
    });
  }, [activities, parsedSearch, sortedTempWorkspaces]);

  const filteredRepos = useMemo(() => {
    let filtered = repositories;

    // Filter hidden repositories using cached settings
    filtered = filtered.filter((repo) => {
      const settings = repoSettingsMap[normalizePath(repo.path)] || DEFAULT_REPOSITORY_SETTINGS;
      return !settings.hidden;
    });

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
      const query = parsedSearch.textQuery;
      filtered = filtered.filter((repo) => {
        if (repo.name.toLowerCase().includes(query)) return true;
        const repoWorktrees = worktreesMap[repo.path] || [];
        return repoWorktrees.some(
          (wt) =>
            wt.branch?.toLowerCase().includes(query) ||
            getDisplayPath(wt.path).toLowerCase().includes(query)
        );
      });
    }

    return filtered.map((repo) => ({
      repo,
      originalIndex: repositories.indexOf(repo),
    }));
  }, [
    repositories,
    worktreesMap,
    allRepoWorktreesMap,
    activeGroupId,
    repoSettingsMap,
    parsedSearch,
    activePathSet,
  ]);

  const groupedSections = useMemo(() => {
    if (!showSections) return [];

    // Use the same hidden filter as filteredRepos
    const visibleRepos = repositories.filter((repo) => {
      const settings = repoSettingsMap[normalizePath(repo.path)] || DEFAULT_REPOSITORY_SETTINGS;
      return !settings.hidden;
    });

    const sections: Array<{
      groupId: string;
      name: string;
      emoji: string;
      color: string;
      repos: Array<{ repo: Repository; originalIndex: number }>;
    }> = [];

    const sortedGroups = [...groups].sort((a, b) => a.order - b.order);
    for (const group of sortedGroups) {
      const groupRepos = visibleRepos
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

    const ungroupedRepos = visibleRepos
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
  }, [showSections, groups, repositories, repoSettingsMap, t]);

  // Filter worktrees for a specific repo
  const getFilteredWorktrees = useCallback(
    (repoPath: string) => {
      const repoWorktrees = worktreesMap[repoPath] || [];
      return repoWorktrees.filter((wt) => {
        if (parsedSearch.hasActiveFilter) {
          const activity = activities[normalizePath(wt.path)] ?? activities[wt.path];
          const hasActivity =
            activity !== undefined && (activity.agentCount > 0 || activity.terminalCount > 0);
          if (!hasActivity) return false;
        }

        if (!parsedSearch.textQuery) return true;

        return (
          wt.branch?.toLowerCase().includes(parsedSearch.textQuery) ||
          wt.path.toLowerCase().includes(parsedSearch.textQuery)
        );
      });
    },
    [worktreesMap, parsedSearch, activities]
  );

  const renderRepoItem = (repo: Repository, originalIndex: number, sectionGroupId?: string) => {
    const isSelected = selectedRepo === repo.path;
    const isExpanded = expandedRepos.has(repo.path);
    const worktreeSectionId = getSidebarSectionId('tree-worktrees', repo.path);
    const repoCanLoad = canLoadRepo(repo.path);
    const repoWorktrees = getFilteredWorktrees(repo.path);
    const repoError = errorsMap[repo.path];
    const repoLoading = repoCanLoad
      ? (loadingMap[repo.path] ?? (isExpanded && !worktreesMap[repo.path]))
      : false;
    const repoWts = worktreesMap[repo.path] || [];
    const displayRepoPath = getDisplayPath(repo.path);
    const useLtrPathDisplay = isWslUncPath(displayRepoPath);
    const activeWorktreeCount = repoWts.filter((wt) =>
      activePathSet.has(normalizePath(wt.path))
    ).length;

    return (
      <div key={repo.path} className="relative">
        {/* Repository row */}
        <div>
          {/* Drop indicator - top */}
          {dropRepoTargetIndex === originalIndex &&
            draggedRepoIndexRef.current !== null &&
            draggedRepoIndexRef.current > originalIndex && (
              <div className="absolute -top-0.5 left-2 right-2 h-0.5 rounded-full bg-theme/75" />
            )}
          <div
            draggable={!searchQuery && !!onReorderRepositories}
            onDragStart={(e) => handleRepoDragStart(e, originalIndex, repo)}
            onDragEnd={handleRepoDragEnd}
            onDragOver={(e) => handleRepoDragOver(e, originalIndex, sectionGroupId)}
            onDragLeave={handleRepoDragLeave}
            onDrop={(e) => handleRepoDrop(e, originalIndex, sectionGroupId)}
            onContextMenu={(e) => handleRepoContextMenu(e, repo)}
            className={cn(
              'control-tree-node group flex w-full flex-col gap-0.5 px-2 py-1 text-left',
              draggedRepoIndexRef.current === originalIndex && 'opacity-50'
            )}
            data-active={isSelected ? 'repo' : 'false'}
          >
            {/* Row 1: Chevron + Icon + Name + Actions */}
            <div className="relative z-10 flex w-full items-start gap-1.5">
              <button
                type="button"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-theme/10 hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleRepoExpanded(repo.path);
                }}
                aria-expanded={isExpanded}
                aria-controls={worktreeSectionId}
                aria-label={
                  isExpanded ? t('Collapse repository worktrees') : t('Expand repository worktrees')
                }
                title={isExpanded ? t('Collapse') : t('Expand')}
              >
                <ChevronRight
                  className={cn(
                    'h-3.5 w-3.5 text-muted-foreground transition-transform duration-150 ease-out',
                    isExpanded && 'rotate-90'
                  )}
                />
              </button>
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
                    <span className="control-tree-title min-w-0 flex-1 truncate text-left">
                      {repo.name}
                    </span>
                    {(isSelected || isExpanded || activeWorktreeCount > 0) &&
                    ((repoCanLoad && repoWts.length > 0) || activeWorktreeCount > 0) ? (
                      <span className="control-tree-meta control-tree-meta-row shrink-0">
                        {repoWts.length > 0 ? (
                          <span className="control-tree-count">{repoWts.length} trees</span>
                        ) : null}
                        {repoWts.length > 0 && activeWorktreeCount > 0 ? (
                          <span className="control-tree-separator">·</span>
                        ) : null}
                        {activeWorktreeCount > 0 ? (
                          <span className="control-tree-count control-tree-count-live">
                            {activeWorktreeCount} live
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </div>
                  <div
                    className={cn(
                      'control-tree-subtitle mt-px overflow-hidden whitespace-nowrap text-ellipsis [text-align:left]',
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
                  openRepoMenu(repo, { anchor: e.currentTarget });
                }}
                aria-label={t('Repository actions')}
                title={t('Repository actions')}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {/* Drop indicator - bottom */}
          {dropRepoTargetIndex === originalIndex &&
            draggedRepoIndexRef.current !== null &&
            draggedRepoIndexRef.current < originalIndex && (
              <div className="absolute -bottom-0.5 left-2 right-2 h-0.5 rounded-full bg-theme/75" />
            )}
        </div>

        {/* Worktrees under this repo */}
        {isExpanded ? (
          <div
            id={worktreeSectionId}
            className="control-tree-guide ml-3.5 mr-1 mt-0.5 flex flex-col gap-y-0.5 overflow-hidden pl-1.5"
          >
            {!repoCanLoad ? (
              <div className="px-3 py-1.5 text-xs text-muted-foreground">
                {t('Click to load worktrees')}
              </div>
            ) : repoError ? (
              <div className="flex flex-col items-start gap-1.5 px-3 py-1.5 text-xs text-muted-foreground">
                <span className="text-destructive">{t('Not a Git repository')}</span>
                {onInitGit && isSelected && (
                  <Button
                    onClick={async () => {
                      await onInitGit();
                      refetchExpandedWorktrees();
                    }}
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs w-fit"
                  >
                    <GitBranch className="mr-1 h-3 w-3" />
                    {t('Init')}
                  </Button>
                )}
              </div>
            ) : repoLoading ? (
              <div className="space-y-1">
                {[0, 1].map((i) => (
                  <div
                    key={`skeleton-${i}`}
                    className="mx-2 h-12 animate-pulse rounded-lg border border-theme/12 bg-theme/8"
                  />
                ))}
              </div>
            ) : repoWorktrees.length === 0 ? (
              <div className="px-3 py-1.5 text-xs text-muted-foreground">
                {hasSearchFilter
                  ? t('No matching worktrees')
                  : t('No worktrees. Create one to get started.')}
              </div>
            ) : (
              repoWorktrees.map((worktree, wtIndex) => (
                <WorktreeTreeItem
                  key={worktree.path}
                  worktree={worktree}
                  repoPath={repo.path}
                  branches={branches}
                  isActive={activeWorktree?.path === worktree.path}
                  onClick={() => {
                    if (!isSelected) {
                      onSelectRepo(repo.path, { activateRemote: true });
                    }
                    onSelectWorktree(worktree);
                  }}
                  onDelete={() => setWorktreeToDelete(worktree)}
                  onMerge={onMergeWorktree ? () => onMergeWorktree(worktree) : undefined}
                  draggable={!searchQuery && !!onReorderWorktrees && isSelected}
                  onDragStart={(e) => handleWorktreeDragStart(e, wtIndex, worktree)}
                  onDragEnd={handleWorktreeDragEnd}
                  onDragOver={(e) => handleWorktreeDragOver(e, wtIndex)}
                  onDragLeave={handleWorktreeDragLeave}
                  onDrop={(e) => handleWorktreeDrop(e, wtIndex)}
                  showDropIndicator={dropWorktreeTargetIndex === wtIndex}
                  dropDirection={
                    dropWorktreeTargetIndex === wtIndex && draggedWorktreeIndexRef.current !== null
                      ? draggedWorktreeIndexRef.current > wtIndex
                        ? 'top'
                        : 'bottom'
                      : null
                  }
                />
              ))
            )}
          </div>
        ) : null}
      </div>
    );
  };

  const tempWorkspacesSectionId = 'tree-temp-workspaces';

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
            <span className="control-sidebar-title">{t('Projects')}</span>
            <span className="control-sidebar-subtitle">
              {activeGroup?.name ?? t('Workspace overview')}
            </span>
          </div>
          <span className="control-sidebar-count">{filteredRepos.length}</span>
        </div>
        <div className="control-sidebar-toolbar no-drag">
          {/* Manage repositories button */}
          <button
            type="button"
            className="control-sidebar-toolbutton no-drag"
            onClick={() => setRepoManagerOpen(true)}
            title={t('Repositories')}
          >
            <List className="h-3.5 w-3.5" />
          </button>
          {/* Refresh button */}
          <button
            type="button"
            className="control-sidebar-toolbutton no-drag"
            onClick={() => {
              onRefresh();
              refetchExpandedWorktrees();
            }}
            title={t('Refresh')}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <RunningProjectsPopover
            onSelectWorktreeByPath={onSwitchWorktreeByPath || (() => {})}
            onSwitchTab={onSwitchTab}
          />
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
            placeholder={`${t('Search')} (:active)`}
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

      {/* Tree List */}
      <div className="flex-1 overflow-auto px-1.5 py-1.5">
        {temporaryWorkspaceEnabled && (
          <div className="mb-1.5">
            <div
              className="control-tree-node group flex w-full items-start gap-1.5 px-2 py-1 text-left"
              data-active={selectedRepo === TEMP_REPO_ID ? 'repo' : 'false'}
            >
              <button
                type="button"
                onClick={() => {
                  onSelectRepo(TEMP_REPO_ID);
                  setTempExpanded((prev) => !prev);
                }}
                className="flex min-w-0 flex-1 flex-col gap-0.5 text-left outline-none"
                aria-expanded={tempExpanded}
                aria-controls={tempWorkspacesSectionId}
                aria-current={selectedRepo === TEMP_REPO_ID ? 'page' : undefined}
              >
                <div className="relative z-10 flex w-full items-center gap-1">
                  <span className="shrink-0 w-5 h-5 flex items-center justify-center">
                    <ChevronRight
                      className={cn(
                        'h-3.5 w-3.5 text-muted-foreground transition-transform duration-150 ease-out',
                        tempExpanded && 'rotate-90'
                      )}
                    />
                  </span>
                  <span className="control-tree-glyph h-4 w-4 shrink-0">
                    <Clock className="control-tree-icon h-4 w-4" />
                  </span>
                  <span className="control-tree-title min-w-0 flex-1 truncate text-left">
                    {t('Temp Session')}
                  </span>
                </div>
                {tempBasePath ? (
                  <span
                    className={cn(
                      'control-tree-subtitle relative z-10 mt-px pl-11 overflow-hidden whitespace-nowrap text-ellipsis [text-align:left] [unicode-bidi:plaintext]',
                      isWslUncPath(tempBasePath) ? '[direction:ltr]' : '[direction:rtl]'
                    )}
                  >
                    {tempBasePath}
                  </span>
                ) : (
                  <span className="control-tree-subtitle relative z-10 mt-px pl-11">
                    {t('Quick scratch sessions')}
                  </span>
                )}
              </button>
              {onCreateTempWorkspace ? (
                <button
                  type="button"
                  className="control-tree-action mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-theme/10 hover:text-foreground"
                  onClick={() => onCreateTempWorkspace()}
                  aria-label={t('New Temp Session')}
                  title={t('New Temp Session')}
                >
                  <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              ) : null}
            </div>

            {tempExpanded ? (
              <div
                id={tempWorkspacesSectionId}
                className="control-tree-guide ml-3.5 mr-1 mt-0.5 flex flex-col gap-y-0.5 overflow-hidden pl-1.5"
              >
                {filteredTempWorkspaces.length === 0 ? (
                  <div className="px-2 py-2 text-xs text-muted-foreground">
                    {hasSearchFilter ? t('No matching temp sessions') : t('No temp sessions')}
                  </div>
                ) : (
                  filteredTempWorkspaces.map((item) => (
                    <TempWorkspaceTreeItem
                      key={item.id}
                      item={item}
                      isActive={selectedRepo === TEMP_REPO_ID && activeWorktree?.path === item.path}
                      onSelect={() => onSelectTempWorkspace?.(item.path)}
                      onRequestRename={() => onRequestTempRename?.(item.id)}
                      onRequestDelete={() => onRequestTempDelete?.(item.id)}
                    />
                  ))
                )}
              </div>
            ) : null}
          </div>
        )}

        {repositories.length === 0 ? (
          <div className="flex h-full items-start justify-start px-2 py-3">
            <SidebarEmptyState
              icon={<FolderGit2 className="h-4.5 w-4.5" />}
              label={t('Getting Started')}
              title={t('No repositories yet')}
              description={t(
                'Add one to unlock worktrees, files, terminals, and agent sessions from this sidebar.'
              )}
              actions={
                <Button
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onAddRepository();
                  }}
                  variant="default"
                  size="sm"
                  className="control-action-button control-action-button-primary rounded-lg px-3.5 text-sm font-semibold tracking-[-0.01em]"
                >
                  <Plus className="h-4 w-4" />
                  {t('Add Repository')}
                </Button>
              }
            />
          </div>
        ) : filteredRepos.length === 0 && filteredTempWorkspaces.length === 0 ? (
          <div className="flex h-full items-start justify-start px-2 py-3">
            <SidebarEmptyState
              icon={<Search className="h-4.5 w-4.5" />}
              label={t('Filtered View')}
              title={t('No matches')}
              description={t(
                'No repositories or temp sessions match the current search. Try a broader term or clear the filter.'
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
        ) : (
          <LayoutGroup>
            {showSections ? (
              <div className="space-y-1.5">
                {groupedSections.map((section) => {
                  const isGroupCollapsed = !!collapsedGroups[section.groupId];
                  const isUngrouped = section.groupId === UNGROUPED_SECTION_ID;
                  const sectionContentId = `tree-section-${section.groupId}`;
                  return (
                    <div key={section.groupId}>
                      {/* Section Header */}
                      <button
                        type="button"
                        onClick={() => toggleGroupCollapsed(section.groupId)}
                        className="control-section-header select-none"
                        aria-expanded={!isGroupCollapsed}
                        aria-controls={sectionContentId}
                      >
                        <ChevronRight
                          className={cn(
                            'h-3 w-3 shrink-0 transition-transform duration-150',
                            !isGroupCollapsed && 'rotate-90'
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
                        {!isGroupCollapsed && (
                          <motion.div
                            key={`group-content-${section.groupId}`}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            variants={heightVariants}
                            transition={springStandard}
                            className="overflow-hidden"
                            id={sectionContentId}
                          >
                            <div className="space-y-1 pt-0.5">
                              {section.repos.map(({ repo, originalIndex }) => {
                                return renderRepoItem(repo, originalIndex, section.groupId);
                              })}
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

      {/* Repository Context Menu */}
      {repoMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-50"
            onClick={() => setRepoMenuOpen(false)}
            onContextMenu={(e) => {
              e.preventDefault();
              setRepoMenuOpen(false);
            }}
            role="presentation"
          />
          <div
            ref={repoMenuRef}
            className="fixed z-50 min-w-32 rounded-lg border bg-popover p-1 shadow-lg"
            style={{ left: repoMenuPosition.x, top: repoMenuPosition.y }}
            role="menu"
            aria-label={t('Repository actions')}
            onKeyDown={(e) => handleMenuNavigationKeyDown(e, () => setRepoMenuOpen(false))}
          >
            {/* New Worktree button */}
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-theme/10"
              onClick={() => {
                setRepoMenuOpen(false);
                // Switch to the right-clicked repo first, then wait for state update
                if (
                  repoMenuTarget &&
                  (repoMenuTarget.path !== selectedRepo || !canLoadRepo(repoMenuTarget.path))
                ) {
                  onSelectRepo(repoMenuTarget.path, { activateRemote: true });
                  setPendingCreateWorktree(true);
                } else {
                  // Already on target repo, trigger refresh and open dialog
                  onRefresh();
                  refetchExpandedWorktrees();
                  setCreateWorktreeDialogOpen(true);
                }
              }}
              role="menuitem"
            >
              <Plus className="h-4 w-4" />
              {t('New Worktree')}
            </button>

            {/* Repository Settings */}
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-theme/10"
              onClick={() => {
                setRepoMenuOpen(false);
                if (repoMenuTarget) {
                  setRepoSettingsTarget(repoMenuTarget);
                  setRepoSettingsOpen(true);
                }
              }}
              role="menuitem"
            >
              <Settings2 className="h-4 w-4" />
              {t('Repository Settings')}
            </button>

            {/* Hide Repository */}
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-theme/10"
              onClick={() => {
                setRepoMenuOpen(false);
                if (repoMenuTarget) {
                  const currentSettings = getRepositorySettings(repoMenuTarget.path);
                  saveRepositorySettings(repoMenuTarget.path, {
                    ...currentSettings,
                    hidden: true,
                  });
                  refreshRepoSettings();
                  // If hiding the currently selected repo, switch to next visible one
                  if (selectedRepo === repoMenuTarget.path) {
                    const nextVisible = repositories.find(
                      (r) => r.path !== repoMenuTarget.path && !getRepositorySettings(r.path).hidden
                    );
                    if (nextVisible) {
                      onSelectRepo(nextVisible.path);
                    }
                  }
                  const copy = buildWorkspaceToastCopy(
                    { action: 'repository-hide', phase: 'success' },
                    t
                  );
                  toastManager.add({
                    title: copy.title,
                    description: copy.description,
                    type: 'success',
                    timeout: 3000,
                  });
                }
              }}
              role="menuitem"
            >
              <EyeOff className="h-4 w-4" />
              {t('Hide Repository')}
            </button>

            {!hideGroups && onMoveToGroup && groups.length > 0 && (
              <MoveToGroupSubmenu
                groups={groups}
                currentGroupId={repoMenuTarget?.groupId}
                onMove={(groupId) => {
                  if (repoMenuTarget) {
                    onMoveToGroup(repoMenuTarget.path, groupId);
                  }
                }}
                onClose={() => setRepoMenuOpen(false)}
              />
            )}

            {/* Separator */}
            <div className="my-1 h-px bg-border" />

            {/* Remove repository button */}
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive transition-colors hover:bg-destructive/10"
              onClick={handleRemoveRepoClick}
              role="menuitem"
            >
              <FolderMinus className="h-4 w-4" />
              {t('Remove repository')}
            </button>
          </div>
        </>
      )}

      {/* Remove repository confirmation dialog */}
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
            <AlertDialogTitle>
              {removeRepoDialogCopy?.title ?? t('Remove repository')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removeRepoDialogCopy?.description}
              <span className="block mt-2 text-muted-foreground">
                {removeRepoDialogCopy?.consequence}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline">{t('Cancel')}</Button>} />
            <Button variant="destructive" onClick={handleConfirmRemoveRepo}>
              {removeRepoDialogCopy?.actionLabel ?? t('Remove repository')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

      {/* Delete worktree confirmation dialog */}
      <AlertDialog
        open={!!worktreeToDelete}
        onOpenChange={(open) => {
          if (!open) {
            setWorktreeToDelete(null);
            setDeleteBranch(false);
            setForceDelete(false);
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
                  refetchExpandedWorktrees();
                }
              }}
            >
              {deleteWorktreeDialogCopy?.actionLabel ?? t('Delete worktree')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

      {/* Create Worktree Dialog (triggered from context menu) */}
      <CreateWorktreeDialog
        open={createWorktreeDialogOpen}
        onOpenChange={setCreateWorktreeDialogOpen}
        branches={branches}
        projectName={selectedRepo ? getDisplayPathBasename(selectedRepo) : ''}
        workdir={workdir}
        isLoading={isCreating}
        onSubmit={async (options) => {
          await onCreateWorktree(options);
          refetchExpandedWorktrees();
        }}
      />

      {/* Repository Settings Dialog */}
      {repoSettingsTarget && (
        <RepositorySettingsDialog
          open={repoSettingsOpen}
          onOpenChange={setRepoSettingsOpen}
          repoPath={repoSettingsTarget.path}
          repoName={repoSettingsTarget.name}
        />
      )}

      {/* Repository Manager Dialog */}
      <RepositoryManagerDialog
        open={repoManagerOpen}
        onOpenChange={setRepoManagerOpen}
        repositories={repositories}
        selectedRepo={selectedRepo}
        onSelectRepo={onSelectRepo}
        onRemoveRepository={onRemoveRepository}
        onSettingsChange={refreshRepoSettings}
      />

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

interface TempWorkspaceTreeItemProps {
  item: TempWorkspaceItem;
  isActive: boolean;
  onSelect: () => void;
  onRequestRename: () => void;
  onRequestDelete: () => void;
}

function TempWorkspaceTreeItem({
  item,
  isActive,
  onSelect,
  onRequestRename,
  onRequestDelete,
}: TempWorkspaceTreeItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const activities = useWorktreeActivityStore((s) => s.activities);
  const activity = activities[item.path] || { agentCount: 0, terminalCount: 0 };
  const hasActivity = activity.agentCount > 0 || activity.terminalCount > 0;
  const displayTempPath = getDisplayPath(item.path);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuPosition({ x: e.clientX, y: e.clientY });
    setMenuOpen(true);
  };

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={onSelect}
          onContextMenu={handleContextMenu}
          className="control-tree-node group flex w-full flex-col gap-0.5 px-2 py-1 text-left"
          data-active={isActive ? 'worktree' : 'false'}
          aria-current={isActive ? 'page' : undefined}
        >
          <div className="flex items-start gap-1.5">
            <span className="control-tree-glyph mt-0.5 h-4 w-4 shrink-0">
              <GitBranch className="control-tree-icon h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="control-tree-title min-w-0 flex-1 truncate">{item.title}</span>
                {hasActivity ? (
                  <span className="control-tree-meta control-tree-meta-row shrink-0">
                    {activity.agentCount > 0 ? (
                      <span className="control-tree-count">{activity.agentCount} agents</span>
                    ) : null}
                    {activity.agentCount > 0 && activity.terminalCount > 0 ? (
                      <span className="control-tree-separator">·</span>
                    ) : null}
                    {activity.terminalCount > 0 ? (
                      <span className="control-tree-count">{activity.terminalCount} terminals</span>
                    ) : null}
                  </span>
                ) : null}
              </div>
              <div className="control-tree-subtitle truncate [unicode-bidi:plaintext]">
                {displayTempPath}
              </div>
            </div>
          </div>
        </button>
      </div>

      <TempWorkspaceContextMenu
        open={menuOpen}
        position={menuPosition}
        path={item.path}
        onClose={() => setMenuOpen(false)}
        onRename={onRequestRename}
        onDelete={onRequestDelete}
      />
    </>
  );
}

// Worktree item for tree view
interface WorktreeTreeItemProps {
  worktree: GitWorktree;
  repoPath: string;
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

function WorktreeTreeItem({
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

  // Check if branch is merged to main
  const isMerged = useMemo(() => {
    if (!worktree.branch || isMain) return false;
    const branch = branches.find((b) => b.name === worktree.branch);
    return branch?.merged === true;
  }, [worktree.branch, isMain, branches]);

  // Subscribe to activity store
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
  const hasActivity = activity.agentCount > 0 || activity.terminalCount > 0;
  const hasDiffStats = diffStats.insertions > 0 || diffStats.deletions > 0;

  // Auto-clear completed state after 5 seconds when worktree is active
  const COMPLETED_STATE_DURATION_MS = 5000;
  useEffect(() => {
    if (isActive && activityState === 'completed') {
      const timer = setTimeout(() => {
        // Use getState() to avoid stale closure and dependency array issues
        useWorktreeActivityStore.getState().clearActivityState(worktree.path);
      }, COMPLETED_STATE_DURATION_MS);
      return () => clearTimeout(timer);
    }
  }, [isActive, activityState, worktree.path]);

  // Check if any session in this worktree has outputting or unread state
  const _outputState = useWorktreeOutputState(worktree.path);

  // Git sync operations
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

  // Adjust menu position if it overflows viewport
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

  // Button content (without activity indicator - it's now outside)
  const activityLabel =
    activityState === 'running'
      ? 'Running'
      : activityState === 'waiting_input'
        ? 'Waiting'
        : activityState === 'completed'
          ? 'Done'
          : '';
  const branchFlagLabel = isPrunable
    ? t('Deleted')
    : isMain
      ? t('Main')
      : isMerged
        ? t('Merged')
        : null;
  const branchFlagClassName = isPrunable
    ? 'control-tree-flag control-tree-flag-danger'
    : isMain
      ? 'control-tree-flag control-tree-flag-main'
      : isMerged
        ? 'control-tree-flag control-tree-flag-merged'
        : '';
  const hasSyncAction =
    Boolean(!tracking && currentBranch && handlePublish) ||
    Boolean(tracking && (aheadCount > 0 || behindCount > 0) && handleSync);
  const buttonContent = (
    <>
      {/* Drop indicator - top */}
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
      >
        <div className="flex w-full items-start gap-1.5">
          <span className="control-tree-glyph mt-0.5 h-4 w-4 shrink-0">
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
            onClick={onClick}
            className="min-w-0 flex flex-1 flex-col items-start rounded-[inherit] text-left outline-none"
            aria-current={isActive ? 'page' : undefined}
          >
            <div className="flex w-full items-center gap-1.5">
              <span
                className={cn(
                  'control-tree-title min-w-0 flex-1 truncate',
                  isPrunable && 'line-through'
                )}
              >
                {branchDisplay}
              </span>
            </div>
            <div className="control-tree-subtitle truncate [unicode-bidi:plaintext]">
              {displayWorktreePath}
            </div>

            <div className="control-tree-meta control-tree-meta-row mt-0.5">
              {activityState !== 'idle' && (
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
              )}
              {activity.agentCount > 0 ? (
                <span className="control-tree-metric">
                  <span className="control-tree-metric-label">A</span>
                  <span className="control-tree-metric-value">{activity.agentCount}</span>
                </span>
              ) : null}
              {activity.agentCount > 0 && (activity.terminalCount > 0 || hasDiffStats) ? (
                <span className="control-tree-separator">·</span>
              ) : null}
              {activity.terminalCount > 0 ? (
                <span className="control-tree-metric">
                  <span className="control-tree-metric-label">T</span>
                  <span className="control-tree-metric-value">{activity.terminalCount}</span>
                </span>
              ) : null}
              {activity.terminalCount > 0 && hasDiffStats ? (
                <span className="control-tree-separator">·</span>
              ) : null}
              {hasDiffStats ? (
                <span className="control-tree-metric">
                  <span className="control-tree-metric-label">Δ</span>
                  {diffStats.insertions > 0 ? (
                    <span className="control-tree-diff-positive">+{diffStats.insertions}</span>
                  ) : null}
                  {diffStats.insertions > 0 && diffStats.deletions > 0 ? ' ' : ''}
                  {diffStats.deletions > 0 ? (
                    <span className="control-tree-diff-negative">-{diffStats.deletions}</span>
                  ) : null}
                </span>
              ) : null}
            </div>
          </button>

          <div className="control-tree-tail shrink-0 self-start pl-1">
            {branchFlagLabel ? (
              <span className={cn(branchFlagClassName, 'shrink-0')}>{branchFlagLabel}</span>
            ) : null}
            {branchFlagLabel && hasSyncAction ? (
              <span className="control-tree-tail-divider" />
            ) : null}
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
        </div>
      </div>
      {/* Drop indicator - bottom */}
      {showDropIndicator && dropDirection === 'bottom' && (
        <div className="absolute -bottom-0.5 left-0 right-0 h-0.5 rounded-full bg-theme/75" />
      )}
    </>
  );

  return (
    <>
      {/* Flex container: activity indicator on left, button on right */}
      <div className="flex items-center">
        {/* Activity indicator area - same width as ChevronRight container in repo row */}
        <span className="shrink-0 w-5 h-5 flex items-center justify-center">
          <ActivityIndicator state={activityState} size="sm" />
        </span>
        <div className="relative min-w-0 flex-1 rounded-lg">{buttonContent}</div>
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
            className="fixed z-50 min-w-40 rounded-lg border bg-popover p-1 shadow-lg"
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
