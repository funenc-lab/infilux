import type {
  GitBranch as GitBranchType,
  GitWorktree,
  TempWorkspaceItem,
  WorktreeCreateOptions,
} from '@shared/types';
import { getDisplayPath, getDisplayPathBasename, isWslUncPath } from '@shared/utils/path';
import {
  BotMessageSquare,
  BrainCircuit,
  ChevronRight,
  Clock,
  EyeOff,
  FolderGit2,
  FolderMinus,
  GitBranch,
  List,
  ListCollapse,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  X,
} from 'lucide-react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
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
  getClaudeGlobalPolicy,
  getClaudeProjectPolicy,
  getClaudeWorktreePolicy,
  getRepositorySettings,
  getStoredGroupCollapsedState,
  getStoredRepositorySettings,
  getStoredTreeSidebarExpandedRepos,
  getStoredTreeSidebarRecentCollapsed,
  getStoredTreeSidebarTempExpanded,
  normalizePath,
  type RepositorySettings,
  saveClaudeProjectPolicy,
  saveClaudeWorktreePolicy,
  saveGroupCollapsedState,
  saveRepositorySettings,
  saveTreeSidebarExpandedRepos,
  saveTreeSidebarRecentCollapsed,
  saveTreeSidebarTempExpanded,
} from '@/App/storage';
import { isOpenAgentSession } from '@/components/chat/agentSessionLiveness';
import {
  CreateGroupDialog,
  GroupEditDialog,
  GroupSelector,
  MoveToGroupSubmenu,
} from '@/components/group';
import { RepositoryManagerDialog } from '@/components/repository/RepositoryManagerDialog';
import { RepositorySettingsDialog } from '@/components/repository/RepositorySettingsDialog';
import { ClaudePolicyEditorDialog } from '@/components/settings/claude-policy';
import { hasClaudePolicyConfigChanges } from '@/components/settings/claude-policy/model';
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
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { toastManager } from '@/components/ui/toast';
import { CreateWorktreeDialog } from '@/components/worktree/CreateWorktreeDialog';
import { useShouldPoll } from '@/hooks/useWindowFocus';
import { useWorktreeListMultiple } from '@/hooks/useWorktree';
import { useRegisterWorktreeDiffStatsScope } from '@/hooks/useWorktreeDiffStatsScheduler';
import { useI18n } from '@/i18n';
import { buildRemovalDialogCopy, buildWorkspaceToastCopy } from '@/lib/feedbackCopy';
import { focusFirstMenuItem, handleMenuNavigationKeyDown } from '@/lib/menuA11y';
import { cn } from '@/lib/utils';
import { sanitizeGitWorktrees, sanitizeTempWorkspaceItems } from '@/lib/worktreeData';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { useSettingsStore } from '@/stores/settings';
import { useWorktreeActivityStore } from '@/stores/worktreeActivity';
import { CollapsedSidebarRail } from './CollapsedSidebarRail';
import { RepositoryLoadMoreButton } from './RepositoryLoadMoreButton';
import { RunningProjectsPopover } from './RunningProjectsPopover';
import { RepositoryTreeSummary } from './repository-sidebar/RepositoryTreeSummary';
import {
  resolveActiveRepositoryPaths,
  resolveRepositoryGroupScope,
} from './repositoryVisibilityPolicy';
import { SidebarAiCenterButton } from './SidebarAiCenterButton';
import { SidebarEmptyState } from './SidebarEmptyState';
import { SidebarFloatingMenuPortal } from './SidebarFloatingMenuPortal';
import { SidebarToolbarTooltip } from './SidebarToolbarTooltip';
import { buildTreeSidebarWorktreePrefetchInputs } from './sidebarWorktreePrefetchPolicy';
import { TempWorkspaceTreeItem } from './tree-sidebar/TempWorkspaceTreeItem';
import { WorktreeTreeItem } from './tree-sidebar/WorktreeTreeItem';
import { resolveTreeSidebarContextTransition } from './treeSidebarContextPolicy';
import { resolveTreeSidebarRepoSnapshot } from './treeSidebarRepoSnapshot';
import {
  useGroupedRepositoryPagination,
  useProgressiveRepositoryVisibility,
} from './useProgressiveRepositoryVisibility';
import { resolveWorktreeLoadErrorState } from './worktreeLoadErrorState';

function getSidebarSectionId(prefix: string, value: string): string {
  return `${prefix}-${value.replace(/[^a-zA-Z0-9_-]+/g, '-')}`;
}

const EMPTY_WORKTREES: GitWorktree[] = [];

interface TreeInlineEmptyStateProps {
  title: string;
  description: string;
  icon?: ReactNode;
  tone?: string;
  indented?: boolean;
  compact?: boolean;
  actions?: ReactNode;
}

function TreeInlineEmptyState({
  title,
  description,
  icon,
  tone,
  indented = true,
  compact = false,
  actions,
}: TreeInlineEmptyStateProps) {
  return (
    <div
      className={cn(
        'control-tree-guide-item min-w-0',
        indented && 'control-tree-guide-item-worktree'
      )}
    >
      <div
        className="control-tree-inline-empty"
        data-density={compact ? 'compact' : 'default'}
        data-has-icon={icon ? 'true' : undefined}
        data-tone={tone}
      >
        {icon ? (
          <span className="control-tree-inline-icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <div className="control-tree-inline-text">
          <span className="control-tree-inline-title">{title}</span>
          <span className={cn('control-tree-inline-copy', compact && 'sr-only')}>
            {description}
          </span>
        </div>
        {actions ? <div className="control-tree-inline-actions">{actions}</div> : null}
      </div>
    </div>
  );
}

function mergeWorktreesByPath(
  primaryWorktrees: readonly GitWorktree[],
  fallbackWorktrees: readonly GitWorktree[]
): GitWorktree[] {
  const mergedWorktrees = new Map<string, GitWorktree>();

  for (const worktree of sanitizeGitWorktrees(primaryWorktrees)) {
    mergedWorktrees.set(normalizePath(worktree.path), worktree);
  }

  for (const worktree of sanitizeGitWorktrees(fallbackWorktrees)) {
    const normalizedPath = normalizePath(worktree.path);
    if (!mergedWorktrees.has(normalizedPath)) {
      mergedWorktrees.set(normalizedPath, worktree);
    }
  }

  return [...mergedWorktrees.values()];
}

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
  onExpand?: () => void;
  groups: RepositoryGroup[];
  activeGroupId: string;
  onSwitchGroup: (groupId: string) => void;
  onCreateGroup: (name: string, emoji: string, color: string) => RepositoryGroup;
  onUpdateGroup: (groupId: string, name: string, emoji: string, color: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onMoveToGroup?: (repoPath: string, groupId: string | null) => void;
  onSwitchTab?: (tab: TabId) => void;
  isAiCenterActive?: boolean;
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
  isAiCenterActive = false,
  onSwitchWorktreeByPath,
  onOpenAgentThread: _onOpenAgentThread,
  onOpenSubagentTranscript: _onOpenSubagentTranscript,
  isChatActive: _isChatActive = false,
  selectedSubagentByWorktree: _selectedSubagentByWorktree = {},
  temporaryWorkspaceEnabled = false,
  tempWorkspaces = [],
  onSelectTempWorkspace,
  onCreateTempWorkspace,
  onRequestTempRename,
  onRequestTempDelete,
  toggleSelectedRepoExpandedRef,
  isFileDragOver,
}: TreeSidebarProps) {
  const { t, tNode } = useI18n();
  const hideGroups = useSettingsStore((s) => s.hideGroups);
  const todoEnabled = useSettingsStore((s) => s.todoEnabled);
  const recentProjectDisplayLimit = useSettingsStore((s) => s.recentProjectDisplayLimit);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAgentWorktreesOnly, setShowAgentWorktreesOnly] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [repositoryScrollContainer, setRepositoryScrollContainer] = useState<HTMLDivElement | null>(
    null
  );
  const [tempExpanded, setTempExpanded] = useState(() => getStoredTreeSidebarTempExpanded());
  const [recentProjectsCollapsed, setRecentProjectsCollapsed] = useState(() =>
    getStoredTreeSidebarRecentCollapsed()
  );
  const [expandedRepoList, setExpandedRepoList] = useState<string[]>(() =>
    getStoredTreeSidebarExpandedRepos()
  );

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

  const toggleRecentProjectsCollapsed = useCallback(() => {
    setRecentProjectsCollapsed((previous) => {
      const next = !previous;
      saveTreeSidebarRecentCollapsed(next);
      return next;
    });
  }, []);

  const activeGroup = groups.find((g) => g.id === activeGroupId);
  const [repoSettingsMap, setRepoSettingsMap] = useState<Record<string, RepositorySettings>>(
    getStoredRepositorySettings
  );
  const refreshRepoSettings = useCallback(() => {
    setRepoSettingsMap(getStoredRepositorySettings());
  }, []);
  useEffect(() => {
    refreshRepoSettings();
  }, [refreshRepoSettings]);
  const visibleRepos = useMemo(
    () =>
      repositories.filter((repo) => {
        const settings = repoSettingsMap[normalizePath(repo.path)] || DEFAULT_REPOSITORY_SETTINGS;
        return !settings.hidden;
      }),
    [repositories, repoSettingsMap]
  );
  const selectedRepository = useMemo(
    () =>
      selectedRepo
        ? (visibleRepos.find(
            (repository) => normalizePath(repository.path) === normalizePath(selectedRepo)
          ) ?? null)
        : null,
    [selectedRepo, visibleRepos]
  );
  const repositoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const group of groups) {
      counts[group.id] = visibleRepos.filter((repo) => repo.groupId === group.id).length;
    }
    return counts;
  }, [groups, visibleRepos]);
  const repositoriesInActiveGroup = useMemo(
    () => resolveRepositoryGroupScope({ repositories: visibleRepos, activeGroupId }),
    [activeGroupId, visibleRepos]
  );
  const safeTempWorkspaces = useMemo(
    () => sanitizeTempWorkspaceItems(tempWorkspaces),
    [tempWorkspaces]
  );
  const sortedTempWorkspaces = useMemo(
    () => [...safeTempWorkspaces].sort((a, b) => b.createdAt - a.createdAt),
    [safeTempWorkspaces]
  );
  const selectedSnapshotWorktrees = useMemo(() => sanitizeGitWorktrees(_worktrees), [_worktrees]);
  const selectedVisibleWorktrees = useMemo(
    () =>
      mergeWorktreesByPath(
        selectedSnapshotWorktrees,
        selectedRepo && activeWorktree && selectedRepo !== TEMP_REPO_ID
          ? [activeWorktree]
          : EMPTY_WORKTREES
      ),
    [activeWorktree, selectedRepo, selectedSnapshotWorktrees]
  );
  const activities = useWorktreeActivityStore((s) => s.activities);
  const agentSessions = useAgentSessionsStore((s) => s.sessions);
  const activePathSet = useMemo(
    () =>
      new Set(
        Object.entries(activities)
          .filter(([, activity]) => activity.agentCount > 0 || activity.terminalCount > 0)
          .map(([path]) => normalizePath(path))
      ),
    [activities]
  );
  const selectedWorktreesByRepository = useMemo(
    () =>
      selectedRepo && selectedRepo !== TEMP_REPO_ID
        ? { [selectedRepo]: selectedVisibleWorktrees }
        : {},
    [selectedRepo, selectedVisibleWorktrees]
  );
  const activeRepositoryPaths = useMemo(() => {
    const activePaths = [...activePathSet];
    for (const session of agentSessions) {
      if (isOpenAgentSession(session)) {
        activePaths.push(session.repoPath);
      }
    }

    return resolveActiveRepositoryPaths({
      repositories: repositoriesInActiveGroup,
      activeWorktreePaths: activePaths,
      worktreesByRepository: selectedWorktreesByRepository,
    });
  }, [activePathSet, agentSessions, repositoriesInActiveGroup, selectedWorktreesByRepository]);
  const repositorySearchActive = searchQuery.trim().length > 0 || showAgentWorktreesOnly;
  const recentVisibility = useProgressiveRepositoryVisibility({
    repositories: visibleRepos,
    selectedRepo,
    activeRepositoryPaths,
    searchActive: repositorySearchActive,
    initialInactiveLimit: recentProjectDisplayLimit,
    resetKey: `${searchQuery}\u0000${showAgentWorktreesOnly}`,
  });
  const scopedVisibility = useProgressiveRepositoryVisibility({
    repositories: repositoriesInActiveGroup,
    selectedRepo,
    activeRepositoryPaths,
    searchActive: repositorySearchActive,
    resetKey: `${activeGroupId}\u0000${searchQuery}\u0000${showAgentWorktreesOnly}`,
  });

  // Convert list to set for fast lookups
  const expandedRepos = useMemo(() => new Set(expandedRepoList), [expandedRepoList]);
  const expandedRepoPaths = useMemo(
    () =>
      repositoriesInActiveGroup
        .filter((repo) => expandedRepos.has(normalizePath(repo.path)))
        .map((repo) => repo.path),
    [expandedRepos, repositoriesInActiveGroup]
  );

  useEffect(() => {
    const validRepoPaths = new Set(repositories.map((repo) => normalizePath(repo.path)));
    setExpandedRepoList((prev) => {
      const next = prev.filter((repoPath) => validRepoPaths.has(repoPath));
      return next.length === prev.length &&
        next.every((repoPath, index) => repoPath === prev[index])
        ? prev
        : next;
    });
  }, [repositories]);

  useEffect(() => {
    saveTreeSidebarExpandedRepos(expandedRepoList);
  }, [expandedRepoList]);

  useEffect(() => {
    saveTreeSidebarTempExpanded(tempExpanded);
  }, [tempExpanded]);

  // Fetch worktrees for expanded repos only
  const {
    worktreesMap,
    errorsMap,
    loadingMap,
    refetchAll: refetchExpandedWorktrees,
  } = useWorktreeListMultiple(
    expandedRepoPaths.map((repoPath) => ({
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
  const [repoPolicyOpen, setRepoPolicyOpen] = useState(false);
  const [repoPolicyTarget, setRepoPolicyTarget] = useState<Repository | null>(null);
  const [worktreePolicyOpen, setWorktreePolicyOpen] = useState(false);
  const [worktreePolicyTarget, setWorktreePolicyTarget] = useState<{
    repo: Repository;
    worktree: GitWorktree;
  } | null>(null);

  // Repository manager dialog
  const [repoManagerOpen, setRepoManagerOpen] = useState(false);
  const markClaudePolicyStaleForRepo = useAgentSessionsStore((s) => s.markClaudePolicyStaleForRepo);
  const markClaudePolicyStaleForWorktree = useAgentSessionsStore(
    (s) => s.markClaudePolicyStaleForWorktree
  );

  // Create worktree dialog (triggered from context menu)
  const [createWorktreeDialogOpen, setCreateWorktreeDialogOpen] = useState(false);
  const [pendingCreateWorktreeRepoPath, setPendingCreateWorktreeRepoPath] = useState<string | null>(
    null
  );
  const [waitingForBranchRefresh, setWaitingForBranchRefresh] = useState(false);

  // Wait for repo switch before triggering branch refresh
  useEffect(() => {
    if (pendingCreateWorktreeRepoPath && selectedRepo === pendingCreateWorktreeRepoPath) {
      setPendingCreateWorktreeRepoPath(null);
      // Trigger refresh to get branches and worktree list for the new repo
      onRefresh();
      refetchExpandedWorktrees();
      setWaitingForBranchRefresh(true);
    }
  }, [selectedRepo, pendingCreateWorktreeRepoPath, onRefresh, refetchExpandedWorktrees]);

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
      selectedWorktrees: selectedVisibleWorktrees,
      selectedActiveWorktree: activeWorktree,
      selectedActiveWorktreePath: activeWorktree?.path ?? null,
      selectedIsLoading: selectedRepoLoading,
      selectedIsFetching: selectedRepoFetching,
      selectedError: selectedRepoError,
      worktreesMap,
      loadingMap,
      errorsMap,
      isExpanded: expandedRepos.has(normalizePath(selectedRepo)),
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
    selectedVisibleWorktrees,
    worktreesMap,
  ]);

  // Get the main worktree path for git operations (from selected repo's worktrees)
  const selectedRepoWorktrees = selectedRepoSnapshot.worktrees;
  const mainWorktree = selectedRepoWorktrees.find((wt) => wt.isMainWorktree);
  const workdir = mainWorktree?.path || selectedRepo || '';

  const shouldPoll = useShouldPoll();
  const liveDiffStatPaths = useMemo(() => [...activePathSet], [activePathSet]);

  const previousContextKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const transition = resolveTreeSidebarContextTransition({
      previousContextKey: previousContextKeyRef.current,
      selectedRepo,
      activeWorktreePath: activeWorktree?.path ?? null,
      selectedRepository,
      expandedRepoPaths: expandedRepoList,
      activeGroupId,
    });
    previousContextKeyRef.current = transition.contextKey;

    if (!transition.contextChanged) {
      return;
    }

    if (transition.expandedRepoPaths.length !== expandedRepoList.length) {
      if (selectedRepo && selectedRepo !== TEMP_REPO_ID) {
        onActivateRemoteRepo(selectedRepo);
      }
      setExpandedRepoList(transition.expandedRepoPaths);
    }

    if (transition.groupIdToSelect) {
      onSwitchGroup(transition.groupIdToSelect);
    }
  }, [
    activeGroupId,
    activeWorktree?.path,
    expandedRepoList,
    onActivateRemoteRepo,
    onSwitchGroup,
    selectedRepo,
    selectedRepository,
  ]);

  const toggleRepoExpanded = useCallback(
    (repoPath: string) => {
      const normalizedRepoPath = normalizePath(repoPath);
      const isExpanded = expandedRepos.has(normalizedRepoPath);
      if (!isExpanded) {
        onActivateRemoteRepo(repoPath);
      }
      setExpandedRepoList((prev) => {
        if (isExpanded) {
          return prev.filter((p) => p !== normalizedRepoPath);
        }
        return prev.includes(normalizedRepoPath) ? prev : [...prev, normalizedRepoPath];
      });
    },
    [expandedRepos, onActivateRemoteRepo]
  );

  const handleTreeNavigationKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement) || !target.dataset.treeNavigationItem) {
        return;
      }

      const treeItems = Array.from(
        event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-tree-navigation-item]')
      );
      const currentIndex = treeItems.indexOf(target);
      if (currentIndex < 0) {
        return;
      }

      const focusItem = (index: number) => {
        treeItems[index]?.focus();
      };

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        focusItem(Math.min(currentIndex + 1, treeItems.length - 1));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        focusItem(Math.max(currentIndex - 1, 0));
        return;
      }

      if (event.key === 'Home') {
        event.preventDefault();
        focusItem(0);
        return;
      }

      if (event.key === 'End') {
        event.preventDefault();
        focusItem(treeItems.length - 1);
        return;
      }

      const isRepository = target.dataset.treeNavigationItem === 'repository';
      if (event.key === 'ArrowRight' && isRepository) {
        event.preventDefault();
        if (target.getAttribute('aria-expanded') === 'false') {
          const repositoryPath = target.dataset.repositoryPath;
          if (repositoryPath) {
            toggleRepoExpanded(repositoryPath);
          }
        } else {
          focusItem(Math.min(currentIndex + 1, treeItems.length - 1));
        }
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        if (isRepository && target.getAttribute('aria-expanded') === 'true') {
          const repositoryPath = target.dataset.repositoryPath;
          if (repositoryPath) {
            toggleRepoExpanded(repositoryPath);
          }
          return;
        }

        if (!isRepository) {
          const parentRepository = treeItems
            .slice(0, currentIndex)
            .reverse()
            .find((item) => item.dataset.treeNavigationItem === 'repository');
          parentRepository?.focus();
        }
      }
    },
    [toggleRepoExpanded]
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
   * Parses sidebar search tokens. Only `:active` is special; the rest stays as repository or worktree text.
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
  const repositoryByPath = useMemo(
    () => new Map(repositories.map((repository) => [normalizePath(repository.path), repository])),
    [repositories]
  );
  const searchableRepos = scopedVisibility.repositories;
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
        hasActiveFilter: parsedSearch.hasActiveFilter || showAgentWorktreesOnly,
        canLoadRepo,
        activeRepoPaths,
        loadedRepoPaths,
      }),
    [
      searchableRepoPaths,
      parsedSearch.hasActiveFilter,
      showAgentWorktreesOnly,
      canLoadRepo,
      activeRepoPaths,
      loadedRepoPaths,
    ]
  );
  const {
    worktreesMap: allRepoWorktreesMap,
    errorsMap: allRepoWorktreesErrorsMap,
    loadingMap: allRepoWorktreesLoadingMap,
  } = useWorktreeListMultiple(allRepoWorktreePrefetchInputs);

  const hasSearchFilter =
    parsedSearch.hasActiveFilter || parsedSearch.textQuery.length > 0 || showAgentWorktreesOnly;
  const hasTextSearchFilter = parsedSearch.hasActiveFilter || parsedSearch.textQuery.length > 0;
  const showSections = activeGroupId === ALL_GROUP_ID && !hasSearchFilter && !hideGroups;
  const openAgentSessionScope = useMemo(() => {
    const worktreePaths = new Set<string>();
    const repoPaths = new Set<string>();

    for (const session of agentSessions) {
      if (!isOpenAgentSession(session)) {
        continue;
      }

      worktreePaths.add(normalizePath(session.cwd));
      repoPaths.add(normalizePath(session.repoPath));
    }

    return { worktreePaths, repoPaths };
  }, [agentSessions]);
  const matchesAgentWorktreeFilter = useCallback(
    (path: string) => {
      return openAgentSessionScope.worktreePaths.has(normalizePath(path));
    },
    [openAgentSessionScope]
  );
  const clearSidebarFilters = useCallback(() => {
    setSearchQuery('');
    setShowAgentWorktreesOnly(false);
    searchInputRef.current?.focus();
  }, []);
  const requestCreateWorktree = useCallback(
    (repository: Repository) => {
      if (repository.path !== selectedRepo || !canLoadRepo(repository.path)) {
        onSelectRepo(repository.path, { activateRemote: true });
        setPendingCreateWorktreeRepoPath(repository.path);
        return;
      }

      onRefresh();
      refetchExpandedWorktrees();
      setCreateWorktreeDialogOpen(true);
    },
    [canLoadRepo, onRefresh, onSelectRepo, refetchExpandedWorktrees, selectedRepo]
  );
  const handleTreeWorktreeSelect = useCallback(
    (worktree: GitWorktree, nextRepoPath?: string) => {
      onSelectWorktree(worktree, nextRepoPath);
    },
    [onSelectWorktree]
  );
  const handleTreeWorktreeDelete = useCallback((worktree: GitWorktree) => {
    setWorktreeToDelete(worktree);
  }, []);
  const handleTreeWorktreePolicyEdit = useCallback(
    (repositoryPath: string, worktree: GitWorktree) => {
      const repository = repositoryByPath.get(normalizePath(repositoryPath));
      if (!repository) {
        return;
      }

      setWorktreePolicyTarget({ repo: repository, worktree });
      setWorktreePolicyOpen(true);
    },
    [repositoryByPath]
  );
  const handleTreeWorktreeMerge = useCallback(
    (worktree: GitWorktree) => {
      onMergeWorktree?.(worktree);
    },
    [onMergeWorktree]
  );
  const filteredTempWorkspaces = useMemo(() => {
    return sortedTempWorkspaces.filter((item) => {
      if (showAgentWorktreesOnly && !matchesAgentWorktreeFilter(item.path)) {
        return false;
      }

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
  }, [
    activities,
    matchesAgentWorktreeFilter,
    parsedSearch,
    showAgentWorktreesOnly,
    sortedTempWorkspaces,
  ]);
  const getSearchableRepoWorktrees = useCallback(
    (repoPath: string) => {
      return repoPath === selectedRepo
        ? selectedVisibleWorktrees
        : worktreesMap[repoPath] || allRepoWorktreesMap[repoPath] || EMPTY_WORKTREES;
    },
    [allRepoWorktreesMap, selectedRepo, selectedVisibleWorktrees, worktreesMap]
  );

  const filteredRepos = useMemo(() => {
    let filtered = searchableRepos;

    if (showAgentWorktreesOnly) {
      filtered = filtered.filter((repo) =>
        openAgentSessionScope.repoPaths.has(normalizePath(repo.path))
      );
    }

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
  }, [
    searchableRepos,
    showAgentWorktreesOnly,
    parsedSearch,
    activePathSet,
    getSearchableRepoWorktrees,
    openAgentSessionScope,
    repoIndexMap,
  ]);
  const showSearchEmptyState =
    hasSearchFilter && filteredRepos.length === 0 && filteredTempWorkspaces.length === 0;

  const allProjectSections = useMemo(() => {
    if (!showSections) return [];

    const sections: Array<{
      groupId: string;
      name: string;
      emoji: string;
      color: string;
      repos: Array<{ repo: Repository; originalIndex: number }>;
      totalCount: number;
    }> = [];

    const sortedGroups = [...groups].sort((a, b) => a.order - b.order);
    for (const group of sortedGroups) {
      const groupRepos = repositoriesInActiveGroup
        .filter((r) => r.groupId === group.id)
        .map((repo) => ({ repo, originalIndex: repoIndexMap.get(repo.path) ?? -1 }));
      if (groupRepos.length > 0) {
        sections.push({
          groupId: group.id,
          name: group.name,
          emoji: group.emoji,
          color: group.color,
          repos: groupRepos,
          totalCount: repositoryCounts[group.id] ?? groupRepos.length,
        });
      }
    }

    const ungroupedRepos = repositoriesInActiveGroup
      .filter((r) => !r.groupId)
      .map((repo) => ({ repo, originalIndex: repoIndexMap.get(repo.path) ?? -1 }));
    if (ungroupedRepos.length > 0) {
      sections.push({
        groupId: UNGROUPED_SECTION_ID,
        name: t('Ungrouped'),
        emoji: '',
        color: '',
        repos: ungroupedRepos,
        totalCount: visibleRepos.filter((repository) => !repository.groupId).length,
      });
    }

    return sections;
  }, [
    groups,
    repoIndexMap,
    repositoryCounts,
    repositoriesInActiveGroup,
    showSections,
    t,
    visibleRepos,
  ]);
  const allProjectSectionIds = useMemo(
    () => allProjectSections.map((section) => section.groupId),
    [allProjectSections]
  );
  const groupedRepositoryPagination = useGroupedRepositoryPagination({
    groupIds: allProjectSectionIds,
    resetKey: `${activeGroupId}\u0000${repositoriesInActiveGroup
      .map((repository) => normalizePath(repository.path))
      .join('\u0001')}`,
  });
  const groupedSections = useMemo(
    () =>
      allProjectSections.map((section) => {
        const page = groupedRepositoryPagination.getPage(section.groupId, section.repos.length);
        return {
          ...section,
          repos: section.repos.slice(0, page.visibleCount),
          ...page,
        };
      }),
    [allProjectSections, groupedRepositoryPagination]
  );
  const recentProjects = useMemo(
    () => (hasSearchFilter ? [] : recentVisibility.repositories),
    [hasSearchFilter, recentVisibility.repositories]
  );
  const collapsibleGroupIds = useMemo(
    () => groupedSections.map((section) => section.groupId),
    [groupedSections]
  );
  const allProjectContentCollapsed =
    expandedRepoList.length === 0 &&
    collapsibleGroupIds.every((groupId) => collapsedGroups[groupId] === true);
  const collapseAllProjectContent = useCallback(() => {
    setExpandedRepoList([]);
    if (collapsibleGroupIds.length === 0) {
      return;
    }

    setCollapsedGroups((previous) => {
      const next = { ...previous };
      for (const groupId of collapsibleGroupIds) {
        next[groupId] = true;
      }
      saveGroupCollapsedState(next);
      return next;
    });
  }, [collapsibleGroupIds]);

  // Filter worktrees for a specific repo
  const getFilteredWorktrees = useCallback(
    (repoWorktrees: GitWorktree[]) => {
      return repoWorktrees.filter((wt) => {
        if (showAgentWorktreesOnly && !matchesAgentWorktreeFilter(wt.path)) {
          return false;
        }

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
    [activities, matchesAgentWorktreeFilter, parsedSearch, showAgentWorktreesOnly]
  );

  const renderedDiffStatRepos = useMemo(() => {
    if (showSections) {
      return groupedSections
        .filter((section) => !collapsedGroups[section.groupId])
        .flatMap((section) => section.repos.map(({ repo }) => repo));
    }

    return filteredRepos.map(({ repo }) => repo);
  }, [collapsedGroups, filteredRepos, groupedSections, showSections]);
  const visibleDiffStatPaths = useMemo(() => {
    const visiblePaths = new Set<string>();

    for (const repo of renderedDiffStatRepos) {
      const isExpanded = expandedRepos.has(normalizePath(repo.path));
      const repoCanLoad = canLoadRepo(repo.path);
      if (!isExpanded || !repoCanLoad) {
        continue;
      }

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
      const prefetchedRepoWorktrees = getSearchableRepoWorktrees(repo.path);
      const repoWorktrees = getFilteredWorktrees(
        mergeWorktreesByPath(repoSnapshot.worktrees, prefetchedRepoWorktrees)
      );

      for (const worktree of repoWorktrees) {
        visiblePaths.add(worktree.path);
      }
    }

    return [...visiblePaths];
  }, [
    activeWorktree?.path,
    canLoadRepo,
    errorsMap,
    expandedRepos,
    getFilteredWorktrees,
    getSearchableRepoWorktrees,
    loadingMap,
    renderedDiffStatRepos,
    selectedRepo,
    selectedRepoError,
    selectedRepoFetching,
    selectedRepoLoading,
    selectedSnapshotWorktrees,
    worktreesMap,
  ]);
  useRegisterWorktreeDiffStatsScope({
    collapsed,
    enabled: shouldPoll,
    selectedPath: activeWorktree?.path,
    livePaths: liveDiffStatPaths,
    visiblePaths: visibleDiffStatPaths,
  });

  const renderRepoItem = (repo: Repository, originalIndex: number, sectionGroupId?: string) => {
    const isSelected = selectedRepo === repo.path;
    const isStoredExpanded = expandedRepos.has(normalizePath(repo.path));
    const isExpanded = isStoredExpanded;
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
    const prefetchedRepoWorktrees = getSearchableRepoWorktrees(repo.path);
    const visibleRepoWorktrees = mergeWorktreesByPath(
      repoSnapshot.worktrees,
      prefetchedRepoWorktrees
    );
    const repoWorktrees = isExpanded ? getFilteredWorktrees(visibleRepoWorktrees) : EMPTY_WORKTREES;
    const repoError = isStoredExpanded
      ? repoSnapshot.error
      : isSelected
        ? selectedRepoError
        : (allRepoWorktreesErrorsMap[repo.path] ?? null);
    const repoErrorState = resolveWorktreeLoadErrorState(repoError);
    const repoLoading = isStoredExpanded
      ? repoSnapshot.isLoading
      : isSelected
        ? selectedRepoLoading
        : (allRepoWorktreesLoadingMap[repo.path] ?? false);
    const repoWts = showAgentWorktreesOnly ? prefetchedRepoWorktrees : repoSnapshot.worktrees;
    const showRepoError = Boolean(repoErrorState && repoWts.length === 0);
    const displayRepoPath = getDisplayPath(repo.path);
    const useLtrPathDisplay = isWslUncPath(displayRepoPath);
    const activeWorktreeCount = repoWts.filter((wt) =>
      activePathSet.has(normalizePath(wt.path))
    ).length;
    const collapsedActiveWorktreeName =
      isSelected && !isExpanded && activeWorktree
        ? activeWorktree.branch || getDisplayPathBasename(activeWorktree.path)
        : null;
    return (
      <div
        key={repo.path}
        className="control-tree-repository-group relative"
        data-expanded={isExpanded ? 'true' : 'false'}
        data-selected={isSelected ? 'true' : 'false'}
      >
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
            data-selection-tone={
              isSelected && isExpanded && activeWorktreeCount > 0 ? 'context' : 'default'
            }
          >
            {/* Row 1: Chevron + Icon + Name + Actions */}
            <div className="control-tree-row relative z-10">
              <button
                type="button"
                className="control-tree-disclosure h-6 w-6 shrink-0"
                data-hover-mode="inherit-row"
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
                aria-expanded={isExpanded}
                aria-level={1}
                data-repository-path={repo.path}
                data-tree-navigation-item="repository"
                role="treeitem"
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
                        activeWorktreeName={collapsedActiveWorktreeName}
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
              <TreeInlineEmptyState
                title={t('Worktrees not loaded')}
                description={t('Select this repository to load and inspect its worktrees.')}
              />
            ) : showRepoError && repoErrorState ? (
              <TreeInlineEmptyState
                title={t(repoErrorState.title)}
                description={t(repoErrorState.inlineDescription)}
                tone={repoErrorState.tone}
                actions={
                  <>
                    {repoErrorState.kind === 'not-git-repository' && onInitGit && isSelected && (
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
                    {repoErrorState.kind !== 'not-git-repository' && isSelected && (
                      <Button
                        onClick={() => {
                          onRefresh();
                          refetchExpandedWorktrees();
                        }}
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs w-fit"
                      >
                        <RefreshCw className="mr-1 h-3 w-3" />
                        {t('Retry')}
                      </Button>
                    )}
                  </>
                }
              />
            ) : repoLoading ? (
              <div className="control-tree-flat-list">
                {[0, 1].map((i) => (
                  <div key={`skeleton-${i}`} className="control-tree-skeleton" />
                ))}
              </div>
            ) : repoWorktrees.length === 0 ? (
              <TreeInlineEmptyState
                compact={!hasSearchFilter}
                icon={hasSearchFilter ? undefined : <GitBranch className="h-3.5 w-3.5" />}
                tone={hasSearchFilter ? undefined : 'empty'}
                title={
                  showAgentWorktreesOnly && !hasTextSearchFilter
                    ? t('No live Agent worktrees')
                    : hasSearchFilter
                      ? t('No matching worktrees')
                      : t('No worktrees')
                }
                description={
                  showAgentWorktreesOnly && !hasTextSearchFilter
                    ? t('This repository has no worktree with a live Agent session.')
                    : hasSearchFilter
                      ? t('Try a broader search term or clear the current filter.')
                      : t('Create one from repository actions when you are ready to branch out.')
                }
                actions={
                  hasSearchFilter ? (
                    <Button
                      onClick={clearSidebarFilters}
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs w-fit"
                    >
                      {showAgentWorktreesOnly ? t('Show all worktrees') : t('Clear Search')}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => requestCreateWorktree(repo)}
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 shrink-0 p-0"
                      aria-label={t('New Worktree')}
                      title={t('New Worktree')}
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="sr-only">{t('New Worktree')}</span>
                    </Button>
                  )
                }
              />
            ) : (
              repoWorktrees.map((worktree, wtIndex) => {
                return (
                  <WorktreeTreeItem
                    key={worktree.path}
                    worktree={worktree}
                    branches={branches}
                    isActive={activeWorktree?.path === worktree.path}
                    repositoryPath={repo.path}
                    isRepositorySelected={isSelected}
                    onSelect={handleTreeWorktreeSelect}
                    onDelete={handleTreeWorktreeDelete}
                    onEditPolicy={handleTreeWorktreePolicyEdit}
                    onMerge={onMergeWorktree ? handleTreeWorktreeMerge : undefined}
                    draggable={!searchQuery && !!onReorderWorktrees && isSelected}
                    worktreeIndex={wtIndex}
                    onDragStart={handleWorktreeDragStart}
                    onDragEnd={handleWorktreeDragEnd}
                    onDragOver={handleWorktreeDragOver}
                    onDragLeave={handleWorktreeDragLeave}
                    onDrop={handleWorktreeDrop}
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
  const isToolbarRefreshActive = selectedRepoLoading || selectedRepoFetching;
  const refreshProjectsLabel = isToolbarRefreshActive
    ? t('Refreshing projects')
    : t('Refresh projects');
  const handleOpenAiCenter = useCallback(() => {
    onSwitchTab?.('ai-center');
  }, [onSwitchTab]);
  const showAiCenterEntry = todoEnabled && Boolean(onSwitchTab);

  const sidebarBody = collapsed ? (
    <CollapsedSidebarRail
      label="Tree Sidebar"
      triggerTitle={t('Tree sidebar actions')}
      icon={GitBranch}
      popupClassName="min-w-[208px]"
      contextAction={
        <RunningProjectsPopover
          onSelectWorktreeByPath={onSwitchWorktreeByPath || (() => {})}
          onSwitchTab={onSwitchTab}
          tooltipSide="inline-end"
          tooltipAlign="center"
          tooltipSideOffset={8}
        />
      }
      primaryAction={{
        id: 'expand-sidebar',
        label: t('Expand Sidebar'),
        icon: PanelLeftOpen,
        onSelect: () => onExpand?.(),
        disabled: !onExpand,
      }}
      secondaryAction={{
        id: showAiCenterEntry ? 'ai-center' : 'manage-repositories',
        label: showAiCenterEntry ? t('AI Center') : t('Repositories'),
        icon: showAiCenterEntry ? BrainCircuit : List,
        onSelect: showAiCenterEntry ? handleOpenAiCenter : () => setRepoManagerOpen(true),
        active: showAiCenterEntry ? isAiCenterActive : false,
      }}
      actions={[
        ...(showAiCenterEntry
          ? [
              {
                id: 'manage-repositories',
                label: t('Repositories'),
                icon: List,
                onSelect: () => setRepoManagerOpen(true),
              },
            ]
          : []),
        {
          id: 'refresh-tree-sidebar',
          label: t('Refresh'),
          icon: RefreshCw,
          onSelect: () => {
            onRefresh();
            refetchExpandedWorktrees();
          },
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
        <div className="control-sidebar-heading no-drag">
          <span className="control-sidebar-title">{t('Projects')}</span>
        </div>
        <div className="control-sidebar-toolbar no-drag">
          <div className="control-sidebar-toolbar-group" data-role="context">
            <RunningProjectsPopover
              onSelectWorktreeByPath={onSwitchWorktreeByPath || (() => {})}
              onSwitchTab={onSwitchTab}
            />
            {showAiCenterEntry ? (
              <SidebarAiCenterButton active={isAiCenterActive} onSelect={handleOpenAiCenter} />
            ) : null}
          </div>
          <div className="control-sidebar-toolbar-group" data-role="data">
            <Menu modal={false}>
              <MenuTrigger
                render={
                  <button
                    type="button"
                    className="control-sidebar-toolbutton no-drag"
                    aria-label={t('More project actions')}
                    title={t('More project actions')}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                }
              />
              <MenuPopup align="end" sideOffset={6} className="min-w-44" withBackdrop={false}>
                <MenuItem
                  onClick={() => {
                    onRefresh();
                    refetchExpandedWorktrees();
                  }}
                  disabled={isToolbarRefreshActive}
                >
                  <RefreshCw
                    className={cn('h-3.5 w-3.5', isToolbarRefreshActive && 'animate-spin')}
                  />
                  {refreshProjectsLabel}
                </MenuItem>
                <MenuItem onClick={collapseAllProjectContent} disabled={allProjectContentCollapsed}>
                  <ListCollapse className="h-3.5 w-3.5" />
                  {t('Collapse all')}
                </MenuItem>
                <MenuSeparator />
                <MenuItem onClick={() => setRepoManagerOpen(true)}>
                  <List className="h-3.5 w-3.5" />
                  {t('Manage repositories')}
                </MenuItem>
              </MenuPopup>
            </Menu>
          </div>
          {onCollapse ? (
            <div className="control-sidebar-toolbar-group" data-role="panel">
              <SidebarToolbarTooltip label={t('Collapse sidebar')}>
                <button
                  type="button"
                  className="control-sidebar-toolbutton no-drag"
                  onClick={onCollapse}
                  aria-label={t('Collapse sidebar')}
                >
                  <PanelLeftClose className="h-3.5 w-3.5" />
                </button>
              </SidebarToolbarTooltip>
            </div>
          ) : null}
        </div>
      </div>

      <div className="control-sidebar-strip">
        {!hideGroups && (
          <GroupSelector
            groups={groups}
            activeGroupId={activeGroupId}
            repositoryCounts={repositoryCounts}
            totalCount={visibleRepos.length}
            onSelectGroup={onSwitchGroup}
            onEditGroup={() => setEditGroupDialogOpen(true)}
            onAddGroup={() => setCreateGroupDialogOpen(true)}
          />
        )}

        <div className="control-sidebar-search-row">
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
          <button
            type="button"
            className="control-sidebar-inline-filter"
            data-active={showAgentWorktreesOnly ? 'true' : 'false'}
            onClick={() => setShowAgentWorktreesOnly((previous) => !previous)}
            aria-pressed={showAgentWorktreesOnly}
            aria-label={
              showAgentWorktreesOnly ? t('Show all worktrees') : t('Only show live Agent sessions')
            }
            title={
              showAgentWorktreesOnly ? t('Show all worktrees') : t('Only show live Agent sessions')
            }
          >
            <BotMessageSquare className="h-3.5 w-3.5 shrink-0" />
            <span>{t('Agent')}</span>
          </button>
        </div>
      </div>

      {/* Tree List */}
      <div
        ref={setRepositoryScrollContainer}
        className="control-sidebar-scroll-region flex-1 overflow-y-auto overflow-x-hidden px-1.5 py-1.5"
        role="tree"
        aria-label={t('Projects')}
        onKeyDown={handleTreeNavigationKeyDown}
      >
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
                  <TreeInlineEmptyState
                    title={hasSearchFilter ? t('No matching temp sessions') : t('No temp sessions')}
                    indented={false}
                    description={
                      hasSearchFilter
                        ? t('Try a broader search term or clear the current filter.')
                        : t('Create one from the add action when you need a scratch workspace.')
                    }
                  />
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

        {visibleRepos.length === 0 ? (
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
                  className="control-action-button control-action-button-primary min-w-0 rounded-lg px-3.5 text-sm font-semibold tracking-normal"
                >
                  <Plus className="h-4 w-4" />
                  {t('Add Repository')}
                </Button>
              }
            />
          </div>
        ) : showSearchEmptyState ? (
          <div className="flex h-full items-start justify-start px-2 py-3">
            <SidebarEmptyState
              icon={<Search className="h-4.5 w-4.5" />}
              label={t('Filtered View')}
              title={t('No matches')}
              description={t(
                'No projects match the current search. Try a broader term or clear the filter.'
              )}
              meta={t('Filter: {{query}}', {
                query:
                  searchQuery.trim() ||
                  (showAgentWorktreesOnly ? t('Agent worktrees') : t('Search query')),
              })}
              actions={
                <Button
                  variant="outline"
                  size="sm"
                  className="control-action-button control-action-button-secondary h-8 rounded-lg px-3 text-sm"
                  onClick={clearSidebarFilters}
                >
                  {showAgentWorktreesOnly ? t('Show all worktrees') : t('Clear Search')}
                </Button>
              }
            />
          </div>
        ) : showSections ? (
          <div>
            {recentProjects.length > 0 ? (
              <section
                className="control-tree-section mb-2"
                data-tree-section-kind="recent"
                data-tree-section-level="primary"
                aria-label={t('Recent')}
              >
                <button
                  type="button"
                  className="control-section-header select-none"
                  onClick={toggleRecentProjectsCollapsed}
                  aria-expanded={!recentProjectsCollapsed}
                  aria-controls="tree-recent-projects"
                  aria-label={
                    recentProjectsCollapsed ? t('Show recent projects') : t('Hide recent projects')
                  }
                >
                  <ChevronRight
                    className={cn(
                      'h-3 w-3 shrink-0 transition-transform duration-150',
                      !recentProjectsCollapsed && 'rotate-90'
                    )}
                    aria-hidden="true"
                  />
                  <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-left">{t('Recent')}</span>
                  <span className="control-section-count" aria-hidden="true">
                    {recentProjects.length}
                  </span>
                </button>
                {!recentProjectsCollapsed ? (
                  <div id="tree-recent-projects">
                    <div className="control-tree-section-body">
                      {recentProjects.map((repo) =>
                        renderRepoItem(repo, repoIndexMap.get(repo.path) ?? -1)
                      )}
                    </div>
                    <RepositoryLoadMoreButton
                      hiddenCount={recentVisibility.hiddenCount}
                      nextBatchSize={recentVisibility.nextBatchSize}
                      onShowMore={recentVisibility.showMore}
                      scrollContainer={repositoryScrollContainer}
                    />
                  </div>
                ) : null}
              </section>
            ) : null}
            <section
              className="control-tree-section"
              data-tree-section-kind="all-projects"
              data-tree-section-level="primary"
              aria-label={t('All repositories')}
            >
              <div className="control-section-header" data-static="true">
                <FolderGit2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-left">{t('All repositories')}</span>
                <span className="control-section-count" aria-hidden="true">
                  {repositoriesInActiveGroup.length}
                </span>
              </div>
              <div className="control-tree-section-list">
                {groupedSections.map((section) => {
                  const isGroupCollapsed = !!collapsedGroups[section.groupId];
                  const sectionContentId = `tree-section-${section.groupId}`;
                  return (
                    <div key={section.groupId} data-tree-section-level="secondary">
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
                          {section.totalCount}
                        </span>
                      </button>
                      {!isGroupCollapsed ? (
                        <div id={sectionContentId}>
                          <div className="control-tree-section-body">
                            {section.repos.map(({ repo, originalIndex }) => {
                              return renderRepoItem(repo, originalIndex, section.groupId);
                            })}
                          </div>
                          <RepositoryLoadMoreButton
                            hiddenCount={section.hiddenCount}
                            nextBatchSize={section.nextBatchSize}
                            onShowMore={() => groupedRepositoryPagination.showMore(section.groupId)}
                            scrollContainer={repositoryScrollContainer}
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        ) : (
          <div>
            <div className="control-tree-flat-list">
              {filteredRepos.map(({ repo, originalIndex }) => renderRepoItem(repo, originalIndex))}
            </div>
            {!hasSearchFilter ? (
              <RepositoryLoadMoreButton
                hiddenCount={scopedVisibility.hiddenCount}
                nextBatchSize={scopedVisibility.nextBatchSize}
                onShowMore={scopedVisibility.showMore}
                scrollContainer={repositoryScrollContainer}
              />
            ) : null}
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
    </aside>
  );

  return (
    <>
      {sidebarBody}

      {/* Repository Context Menu */}
      {repoMenuOpen && (
        <SidebarFloatingMenuPortal>
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
                if (repoMenuTarget) {
                  requestCreateWorktree(repoMenuTarget);
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
                  setRepoPolicyTarget(repoMenuTarget);
                  setRepoPolicyOpen(true);
                }
              }}
              role="menuitem"
            >
              <Settings2 className="h-4 w-4" />
              {t('Project Configuration')}
            </button>

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
        </SidebarFloatingMenuPortal>
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
          onOpenChange={(nextOpen) => {
            setRepoSettingsOpen(nextOpen);
            if (!nextOpen) {
              refreshRepoSettings();
            }
          }}
          repoPath={repoSettingsTarget.path}
          repoName={repoSettingsTarget.name}
        />
      )}

      {repoPolicyTarget ? (
        <ClaudePolicyEditorDialog
          open={repoPolicyOpen}
          onOpenChange={(nextOpen) => {
            setRepoPolicyOpen(nextOpen);
            if (!nextOpen) {
              setRepoPolicyTarget(null);
            }
          }}
          scope="project"
          globalPolicy={getClaudeGlobalPolicy()}
          repoPath={repoPolicyTarget.path}
          repoName={repoPolicyTarget.name}
          projectPolicy={getClaudeProjectPolicy(repoPolicyTarget.path)}
          worktreePolicy={null}
          onSave={(nextPolicy) => {
            const currentPolicy = getClaudeProjectPolicy(repoPolicyTarget.path);
            const changed = hasClaudePolicyConfigChanges(currentPolicy, nextPolicy);
            saveClaudeProjectPolicy(
              repoPolicyTarget.path,
              nextPolicy as Parameters<typeof saveClaudeProjectPolicy>[1]
            );
            if (changed) {
              markClaudePolicyStaleForRepo(repoPolicyTarget.path);
            }
          }}
          onConfigSchemeSelectionChange={() => {
            markClaudePolicyStaleForRepo(repoPolicyTarget.path);
          }}
        />
      ) : null}

      {worktreePolicyTarget ? (
        <ClaudePolicyEditorDialog
          open={worktreePolicyOpen}
          onOpenChange={(nextOpen) => {
            setWorktreePolicyOpen(nextOpen);
            if (!nextOpen) {
              setWorktreePolicyTarget(null);
            }
          }}
          scope="worktree"
          globalPolicy={getClaudeGlobalPolicy()}
          repoPath={worktreePolicyTarget.repo.path}
          repoName={worktreePolicyTarget.repo.name}
          worktreePath={worktreePolicyTarget.worktree.path}
          worktreeName={worktreePolicyTarget.worktree.branch || worktreePolicyTarget.worktree.path}
          projectPolicy={getClaudeProjectPolicy(worktreePolicyTarget.repo.path)}
          worktreePolicy={getClaudeWorktreePolicy(worktreePolicyTarget.worktree.path)}
          onSave={(nextPolicy) => {
            const currentPolicy = getClaudeWorktreePolicy(worktreePolicyTarget.worktree.path);
            const changed = hasClaudePolicyConfigChanges(currentPolicy, nextPolicy);
            saveClaudeWorktreePolicy(
              worktreePolicyTarget.worktree.path,
              nextPolicy as Parameters<typeof saveClaudeWorktreePolicy>[1]
            );
            if (changed) {
              markClaudePolicyStaleForWorktree(
                worktreePolicyTarget.repo.path,
                worktreePolicyTarget.worktree.path
              );
            }
          }}
          onNativeSkillFileChanged={() => {
            markClaudePolicyStaleForWorktree(
              worktreePolicyTarget.repo.path,
              worktreePolicyTarget.worktree.path
            );
          }}
          onConfigSchemeSelectionChange={() => {
            markClaudePolicyStaleForWorktree(
              worktreePolicyTarget.repo.path,
              worktreePolicyTarget.worktree.path
            );
          }}
        />
      ) : null}

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
    </>
  );
}
