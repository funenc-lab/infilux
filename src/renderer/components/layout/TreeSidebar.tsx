import type {
  GitBranch as GitBranchType,
  GitWorktree,
  TempWorkspaceItem,
  WorktreeCreateOptions,
} from '@shared/types';
import { getDisplayPath, getDisplayPathBasename, isWslUncPath } from '@shared/utils/path';
import {
  ChevronRight,
  Clock,
  EyeOff,
  FolderGit2,
  FolderMinus,
  GitBranch,
  List,
  MoreHorizontal,
  PanelLeftClose,
  Plus,
  RefreshCw,
  Search,
  Settings2,
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
import {
  CreateGroupDialog,
  GroupEditDialog,
  GroupSelector,
  MoveToGroupSubmenu,
} from '@/components/group';
import { RepositoryManagerDialog } from '@/components/repository/RepositoryManagerDialog';
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
import { toastManager } from '@/components/ui/toast';
import { CreateWorktreeDialog } from '@/components/worktree/CreateWorktreeDialog';
import { useShouldPoll } from '@/hooks/useWindowFocus';
import { useWorktreeListMultiple } from '@/hooks/useWorktree';
import { useI18n } from '@/i18n';
import { buildRemovalDialogCopy, buildWorkspaceToastCopy } from '@/lib/feedbackCopy';
import { focusFirstMenuItem, handleMenuNavigationKeyDown } from '@/lib/menuA11y';
import { cn } from '@/lib/utils';
import { sanitizeGitWorktrees, sanitizeTempWorkspaceItems } from '@/lib/worktreeData';
import { useSettingsStore } from '@/stores/settings';
import { useWorktreeActivityStore } from '@/stores/worktreeActivity';
import { RunningProjectsPopover } from './RunningProjectsPopover';
import { RepositoryTreeSummary } from './repository-sidebar/RepositoryTreeSummary';
import { SidebarEmptyState } from './SidebarEmptyState';
import { buildTreeSidebarWorktreePrefetchInputs } from './sidebarWorktreePrefetchPolicy';
import { TempWorkspaceTreeItem } from './tree-sidebar/TempWorkspaceTreeItem';
import { WorktreeTreeItem } from './tree-sidebar/WorktreeTreeItem';
import { resolveTreeSidebarRepoSnapshot } from './treeSidebarRepoSnapshot';

function getSidebarSectionId(prefix: string, value: string): string {
  return `${prefix}-${value.replace(/[^a-zA-Z0-9_-]+/g, '-')}`;
}

const EMPTY_WORKTREES: GitWorktree[] = [];
export interface TreeSidebarProps {
  repositories: Repository[];
  selectedRepo: string | null;
  activeWorktree: GitWorktree | null;
  worktrees: GitWorktree[];
  branches: GitBranchType[];
  isLoading?: boolean;
  isFetching?: boolean;
  isCreating?: boolean;
  error?: string | null;
  onSelectRepo: (repoPath: string, options?: { activateRemote?: boolean }) => void;
  canLoadRepo: (repoPath: string) => boolean;
  onActivateRemoteRepo: (repoPath: string) => void;
  onSelectWorktree: (worktree: GitWorktree, nextRepoPath?: string) => void;
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
  onOpenAgentThread?: (worktree: GitWorktree, sessionId: string) => void;
  onOpenSubagentTranscript?: (
    worktree: GitWorktree,
    subagent: import('@shared/types').LiveAgentSubagent
  ) => void;
  isChatActive?: boolean;
  selectedSubagentByWorktree?: Record<string, import('@shared/types').LiveAgentSubagent | null>;
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
  isLoading: selectedRepoLoading = false,
  isFetching: selectedRepoFetching = false,
  isCreating,
  error: selectedRepoError,
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
  onOpenAgentThread: _onOpenAgentThread,
  onOpenSubagentTranscript: _onOpenSubagentTranscript,
  isChatActive: _isChatActive = false,
  selectedSubagentByWorktree: _selectedSubagentByWorktree = {},
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
  const safeTempWorkspaces = useMemo(
    () => sanitizeTempWorkspaceItems(tempWorkspaces),
    [tempWorkspaces]
  );
  const sortedTempWorkspaces = useMemo(
    () => [...safeTempWorkspaces].sort((a, b) => b.createdAt - a.createdAt),
    [safeTempWorkspaces]
  );
  const selectedSnapshotWorktrees = useMemo(() => sanitizeGitWorktrees(_worktrees), [_worktrees]);

  // Convert list to set for fast lookups
  const expandedRepos = useMemo(() => new Set(expandedRepoList), [expandedRepoList]);

  useEffect(() => {
    const validRepoPaths = new Set(repositories.map((repo) => repo.path));
    setExpandedRepoList((prev) => {
      const next = prev.filter((repoPath) => validRepoPaths.has(repoPath));
      return next.length === prev.length ? prev : next;
    });
  }, [repositories]);

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

    return undefined;
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

  const selectedRepoSnapshot = useMemo(() => {
    if (!selectedRepo || selectedRepo === TEMP_REPO_ID) {
      return {
        worktrees: EMPTY_WORKTREES,
        isLoading: false,
        error: null,
      };
    }

    return resolveTreeSidebarRepoSnapshot({
      repoPath: selectedRepo,
      selectedRepo,
      selectedWorktrees: selectedSnapshotWorktrees,
      selectedActiveWorktreePath: activeWorktree?.path ?? null,
      selectedIsLoading: selectedRepoLoading,
      selectedIsFetching: selectedRepoFetching,
      selectedError: selectedRepoError,
      worktreesMap,
      loadingMap,
      errorsMap,
      isExpanded: expandedRepos.has(selectedRepo),
      canLoad: canLoadRepo(selectedRepo),
    });
  }, [
    activeWorktree,
    canLoadRepo,
    errorsMap,
    expandedRepos,
    loadingMap,
    selectedRepo,
    selectedRepoError,
    selectedRepoFetching,
    selectedRepoLoading,
    selectedSnapshotWorktrees,
    worktreesMap,
  ]);

  // Get the main worktree path for git operations (from selected repo's worktrees)
  const selectedRepoWorktrees = selectedRepoSnapshot.worktrees;
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
    const allWorktrees = sanitizeGitWorktrees(Object.values(worktreesMap).flat());
    if (allWorktrees.length === 0 || !shouldPoll) return;

    const loadedPaths = allWorktrees.map((wt) => wt.path);

    fetchDiffStats(loadedPaths);
    const interval = setInterval(() => {
      fetchDiffStats(loadedPaths);
    }, 10000);
    return () => clearInterval(interval);
  }, [worktreesMap, fetchDiffStats, shouldPoll]);

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

  const repoIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const [index, repo] of repositories.entries()) {
      map.set(repo.path, index);
    }
    return map;
  }, [repositories]);
  const visibleRepos = useMemo(
    () =>
      repositories.filter((repo) => {
        const settings = repoSettingsMap[normalizePath(repo.path)] || DEFAULT_REPOSITORY_SETTINGS;
        return !settings.hidden;
      }),
    [repositories, repoSettingsMap]
  );
  const searchableRepos = useMemo(
    () =>
      activeGroupId === ALL_GROUP_ID
        ? visibleRepos
        : visibleRepos.filter((repo) => repo.groupId === activeGroupId),
    [activeGroupId, visibleRepos]
  );
  const searchableRepoPaths = useMemo(
    () => searchableRepos.map((repo) => repo.path),
    [searchableRepos]
  );
  const activeRepoPaths = useMemo(
    () => searchableRepoPaths.filter((repoPath) => activePathSet.has(normalizePath(repoPath))),
    [activePathSet, searchableRepoPaths]
  );
  const loadedRepoPaths = useMemo(() => {
    const paths = new Set(Object.keys(worktreesMap));
    if (selectedRepo) {
      paths.add(selectedRepo);
    }
    return [...paths];
  }, [selectedRepo, worktreesMap]);
  const allRepoWorktreePrefetchInputs = useMemo(
    () =>
      buildTreeSidebarWorktreePrefetchInputs({
        allRepoPaths: searchableRepoPaths,
        hasActiveFilter: parsedSearch.hasActiveFilter,
        canLoadRepo,
        activeRepoPaths,
        loadedRepoPaths,
      }),
    [
      searchableRepoPaths,
      parsedSearch.hasActiveFilter,
      canLoadRepo,
      activeRepoPaths,
      loadedRepoPaths,
    ]
  );
  const { worktreesMap: allRepoWorktreesMap } = useWorktreeListMultiple(
    allRepoWorktreePrefetchInputs
  );

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
  const getSearchableRepoWorktrees = useCallback(
    (repoPath: string) => {
      if (repoPath === selectedRepo) {
        return selectedSnapshotWorktrees;
      }

      return worktreesMap[repoPath] || allRepoWorktreesMap[repoPath] || EMPTY_WORKTREES;
    },
    [allRepoWorktreesMap, selectedRepo, selectedSnapshotWorktrees, worktreesMap]
  );

  const filteredRepos = useMemo(() => {
    let filtered = searchableRepos;

    if (parsedSearch.hasActiveFilter) {
      filtered = filtered.filter((repo) => {
        const normalizedRepoPath = normalizePath(repo.path);
        if (activePathSet.has(normalizedRepoPath)) return true;

        const repoWorktrees = getSearchableRepoWorktrees(repo.path);
        return repoWorktrees.some((worktree) => activePathSet.has(normalizePath(worktree.path)));
      });
    }

    if (parsedSearch.textQuery) {
      const query = parsedSearch.textQuery;
      filtered = filtered.filter((repo) => {
        if (repo.name.toLowerCase().includes(query)) return true;
        const repoWorktrees = getSearchableRepoWorktrees(repo.path);
        return repoWorktrees.some(
          (wt) =>
            wt.branch?.toLowerCase().includes(query) ||
            getDisplayPath(wt.path).toLowerCase().includes(query)
        );
      });
    }

    return filtered.map((repo) => ({
      repo,
      originalIndex: repoIndexMap.get(repo.path) ?? -1,
    }));
  }, [searchableRepos, parsedSearch, activePathSet, getSearchableRepoWorktrees, repoIndexMap]);

  const groupedSections = useMemo(() => {
    if (!showSections) return [];

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
        .map((repo) => ({ repo, originalIndex: repoIndexMap.get(repo.path) ?? -1 }));
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
      .map((repo) => ({ repo, originalIndex: repoIndexMap.get(repo.path) ?? -1 }));
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
  }, [showSections, groups, repoIndexMap, t, visibleRepos]);

  // Filter worktrees for a specific repo
  const getFilteredWorktrees = useCallback(
    (repoWorktrees: GitWorktree[]) => {
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
    [parsedSearch, activities]
  );

  const renderRepoItem = (repo: Repository, originalIndex: number, sectionGroupId?: string) => {
    const isSelected = selectedRepo === repo.path;
    const isExpanded = expandedRepos.has(repo.path);
    const worktreeSectionId = getSidebarSectionId('tree-worktrees', repo.path);
    const repoCanLoad = canLoadRepo(repo.path);
    const repoSnapshot = resolveTreeSidebarRepoSnapshot({
      repoPath: repo.path,
      selectedRepo,
      selectedWorktrees: selectedSnapshotWorktrees,
      selectedActiveWorktreePath: activeWorktree?.path ?? null,
      selectedIsLoading: selectedRepoLoading,
      selectedIsFetching: selectedRepoFetching,
      selectedError: selectedRepoError,
      worktreesMap,
      loadingMap,
      errorsMap,
      isExpanded,
      canLoad: repoCanLoad,
    });
    const repoWorktrees = isExpanded
      ? getFilteredWorktrees(repoSnapshot.worktrees)
      : EMPTY_WORKTREES;
    const repoError = repoSnapshot.error;
    const repoLoading = repoSnapshot.isLoading;
    const repoWts = repoSnapshot.worktrees;
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
            data-selection-tone={isSelected && activeWorktreeCount > 0 ? 'context' : 'default'}
          >
            {/* Row 1: Chevron + Icon + Name + Actions */}
            <div className="control-tree-row relative z-10">
              <button
                type="button"
                className="control-tree-disclosure h-6 w-6 shrink-0"
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
                    'h-3.5 w-3.5 transition-transform duration-150 ease-out',
                    isExpanded && 'rotate-90'
                  )}
                />
              </button>
              <button
                type="button"
                className="control-tree-primary min-w-0 flex-1 text-left outline-none"
                onClick={() => onSelectRepo(repo.path, { activateRemote: true })}
                aria-current={isSelected ? 'page' : undefined}
              >
                <div className="control-tree-primary-content">
                  <span className="control-tree-glyph h-4 w-4 shrink-0">
                    <FolderGit2 className="control-tree-icon h-4 w-4" />
                  </span>
                  <div className="control-tree-text-stack">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="control-tree-title min-w-0 flex-1 truncate text-left">
                        {repo.name}
                      </span>
                      <RepositoryTreeSummary
                        worktreeCount={repoWts.length}
                        activeWorktreeCount={activeWorktreeCount}
                      />
                    </div>
                    <div
                      className={cn(
                        'control-tree-subtitle overflow-hidden whitespace-nowrap text-ellipsis [text-align:left]',
                        useLtrPathDisplay ? '[direction:ltr]' : '[direction:rtl]'
                      )}
                      title={displayRepoPath}
                    >
                      {displayRepoPath}
                    </div>
                  </div>
                </div>
              </button>
              <div className="control-tree-tail" data-role="action">
                <button
                  type="button"
                  className="control-tree-action flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
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
          <div id={worktreeSectionId} className="control-tree-guide">
            {!repoCanLoad ? (
              <div className="control-tree-inline-empty">
                <span className="control-tree-inline-title">{t('Worktrees not loaded')}</span>
                <span className="control-tree-inline-copy">
                  {t('Select this repository to load and inspect its worktrees.')}
                </span>
              </div>
            ) : repoError ? (
              <div className="control-tree-inline-empty" data-tone="danger">
                <span className="control-tree-inline-title">{t('Not a Git repository')}</span>
                <span className="control-tree-inline-copy">
                  {t('Initialize Git here to create and manage worktrees.')}
                </span>
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
              <div className="control-tree-flat-list">
                {[0, 1].map((i) => (
                  <div key={`skeleton-${i}`} className="control-tree-skeleton" />
                ))}
              </div>
            ) : repoWorktrees.length === 0 ? (
              <div className="control-tree-inline-empty">
                <span className="control-tree-inline-title">
                  {hasSearchFilter ? t('No matching worktrees') : t('No worktrees yet')}
                </span>
                <span className="control-tree-inline-copy">
                  {hasSearchFilter
                    ? t('Try a broader search term or clear the current filter.')
                    : t('Create one from repository actions when you are ready to branch out.')}
                </span>
              </div>
            ) : (
              repoWorktrees.map((worktree, wtIndex) => {
                return (
                  <WorktreeTreeItem
                    key={worktree.path}
                    worktree={worktree}
                    branches={branches}
                    isActive={activeWorktree?.path === worktree.path}
                    onClick={() => onSelectWorktree(worktree, isSelected ? undefined : repo.path)}
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
                      dropWorktreeTargetIndex === wtIndex &&
                      draggedWorktreeIndexRef.current !== null
                        ? draggedWorktreeIndexRef.current > wtIndex
                          ? 'top'
                          : 'bottom'
                        : null
                    }
                  />
                );
              })
            )}
          </div>
        ) : null}
      </div>
    );
  };

  const tempWorkspacesSectionId = 'tree-temp-workspaces';
  const hasActiveTempWorkspace =
    selectedRepo === TEMP_REPO_ID &&
    !!activeWorktree &&
    safeTempWorkspaces.some((item) => item.path === activeWorktree.path);

  return (
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
          </div>
          <div className="control-sidebar-toolbar-group">
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
            placeholder={`${t('Search projects')} (:active)`}
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
          <div className="mb-2">
            <div
              className="control-tree-node group flex w-full flex-col gap-0.5 px-2 py-1 text-left"
              data-active={selectedRepo === TEMP_REPO_ID ? 'repo' : 'false'}
              data-selection-tone={hasActiveTempWorkspace ? 'context' : 'default'}
            >
              <div className="control-tree-row relative z-10">
                <button
                  type="button"
                  className="control-tree-disclosure h-6 w-6 shrink-0"
                  onClick={() => setTempExpanded((prev) => !prev)}
                  aria-expanded={tempExpanded}
                  aria-controls={tempWorkspacesSectionId}
                  aria-label={
                    tempExpanded ? t('Collapse temp sessions') : t('Expand temp sessions')
                  }
                  title={tempExpanded ? t('Collapse') : t('Expand')}
                >
                  <ChevronRight
                    className={cn(
                      'h-3.5 w-3.5 transition-transform duration-150 ease-out',
                      tempExpanded && 'rotate-90'
                    )}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSelectRepo(TEMP_REPO_ID);
                    if (!tempExpanded) {
                      setTempExpanded(true);
                    }
                  }}
                  className="control-tree-primary min-w-0 flex-1 text-left outline-none"
                  aria-current={selectedRepo === TEMP_REPO_ID ? 'page' : undefined}
                >
                  <div className="control-tree-primary-content">
                    <span className="control-tree-glyph h-4 w-4 shrink-0">
                      <Clock className="control-tree-icon h-4 w-4" />
                    </span>
                    <div className="control-tree-text-stack">
                      <span className="control-tree-title min-w-0 block truncate text-left">
                        {t('Temp Sessions')}
                      </span>
                      {tempBasePath ? (
                        <span
                          className={cn(
                            'control-tree-subtitle overflow-hidden whitespace-nowrap text-ellipsis [text-align:left] [unicode-bidi:plaintext]',
                            isWslUncPath(tempBasePath) ? '[direction:ltr]' : '[direction:rtl]'
                          )}
                        >
                          {tempBasePath}
                        </span>
                      ) : (
                        <span className="control-tree-subtitle text-left">
                          {t('Quick scratch sessions')}
                        </span>
                      )}
                      {sortedTempWorkspaces.length > 0 ? (
                        <div className="control-tree-meta control-tree-meta-row">
                          <span className="control-tree-metric">
                            <span className="control-tree-metric-value">
                              {sortedTempWorkspaces.length}
                            </span>
                            <span className="control-tree-metric-label">sessions</span>
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </button>
                {onCreateTempWorkspace ? (
                  <div className="control-tree-tail" data-role="action">
                    <button
                      type="button"
                      className="control-tree-action flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                      onClick={() => onCreateTempWorkspace()}
                      aria-label={t('New Temp Session')}
                      title={t('New Temp Session')}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            {tempExpanded ? (
              <div id={tempWorkspacesSectionId} className="control-tree-guide">
                {filteredTempWorkspaces.length === 0 ? (
                  <div className="control-tree-inline-empty">
                    <span className="control-tree-inline-title">
                      {hasSearchFilter ? t('No matching temp sessions') : t('No temp sessions')}
                    </span>
                    <span className="control-tree-inline-copy">
                      {hasSearchFilter
                        ? t('Try a broader search term or clear the current filter.')
                        : t('Create one from the add action when you need a scratch workspace.')}
                    </span>
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
        ) : filteredRepos.length === 0 && filteredTempWorkspaces.length === 0 ? (
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
        ) : showSections ? (
          <div className="control-tree-section-list">
            {groupedSections.map((section) => {
              const isGroupCollapsed = !!collapsedGroups[section.groupId];
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
                      <span className="control-section-marker" aria-hidden="true">
                        {section.emoji}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-left">{section.name}</span>
                    <span className="control-section-count" aria-hidden="true">
                      {section.repos.length}
                    </span>
                  </button>
                  <div
                    id={sectionContentId}
                    className="control-tree-collapsible"
                    data-expanded={!isGroupCollapsed}
                  >
                    <div className="control-tree-section-body">
                      {section.repos.map(({ repo, originalIndex }) => {
                        return renderRepoItem(repo, originalIndex, section.groupId);
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="control-tree-flat-list">
            {filteredRepos.map(({ repo, originalIndex }) => renderRepoItem(repo, originalIndex))}
          </div>
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
            className="control-menu fixed z-50 min-w-32 rounded-lg p-1"
            style={{ left: repoMenuPosition.x, top: repoMenuPosition.y }}
            role="menu"
            aria-label={t('Repository actions')}
            onKeyDown={(e) => handleMenuNavigationKeyDown(e, () => setRepoMenuOpen(false))}
          >
            {/* New Worktree button */}
            <button
              type="button"
              className="control-menu-item flex w-full items-center gap-2 rounded-md px-2 py-1.5"
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
              className="control-menu-item flex w-full items-center gap-2 rounded-md px-2 py-1.5"
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
              className="control-menu-item flex w-full items-center gap-2 rounded-md px-2 py-1.5"
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
              className="control-menu-item control-menu-item-danger flex w-full items-center gap-2 rounded-md px-2 py-1.5"
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
