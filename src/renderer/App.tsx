import { DEFAULT_TEMPORARY_DIRNAME, DEFAULT_WORKSPACE_ROOT_DIRNAME } from '@shared/paths';
import type {
  GitWorktree,
  LiveAgentSubagent,
  RemoteConnectionStatus,
  WorktreeCreateOptions,
  WorktreeMergeOptions,
  WorktreeMergeResult,
} from '@shared/types';
import { getDisplayPath, getDisplayPathBasename } from '@shared/utils/path';
import { isRemoteVirtualPath, toRemoteVirtualPath } from '@shared/utils/remotePath';
import { buildRepositoryId } from '@shared/utils/workspace';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppOverlays } from './App/AppOverlays';
import {
  ALL_GROUP_ID,
  panelTransition,
  type Repository,
  type TabId,
  TEMP_REPO_ID,
} from './App/constants';
import { resolveFileSidebarVisibility } from './App/fileSidebarVisibilityPolicy';
import {
  useAppLifecycle,
  useBackgroundImage,
  useClaudeIntegration,
  useClaudeProviderListener,
  useCodeReviewContinue,
  useFileDragDrop,
  useGroupSync,
  useMenuActions,
  useMergeState,
  useOpenPathListener,
  usePanelState,
  useRepositoryState,
  useSettingsEvents,
  useSettingsState,
  useStartupAgentSessionRecovery,
  useTempWorkspaceActions,
  useTempWorkspaceSync,
  useTerminalNavigation,
  useWorktreeSelection,
  useWorktreeState,
  useWorktreeSync,
} from './App/hooks';
import { resolveMainContentRepoPath } from './App/mainContentRepoPathPolicy';
import {
  resolveWorktreeTabForPersistence,
  resolveWorktreeTabForRestore,
} from './App/settingsWorktreeTabPolicy';
import {
  markStartupBlockingKeyReady,
  resolveInitialStartupBlockingKeys,
  resolveStartupBlockingCopy,
  resolveStartupProgress,
  type StartupBlockingKey,
} from './App/startupOverlayPolicy';
import {
  getRepositorySettings,
  getStoredBoolean,
  getStoredWorktreeMap,
  normalizePath,
  STORAGE_KEYS,
  saveActiveGroupId,
} from './App/storage';
import { useAppKeyboardShortcuts } from './App/useAppKeyboardShortcuts';
import { usePanelResize } from './App/usePanelResize';
import { resolvePreferredWorktreeSelection } from './App/worktreeSelectionPolicy';
import { DevToolsOverlay } from './components/DevToolsOverlay';
import { FileSidebar } from './components/files/FileSidebar';
import { createInitialFileSidebarTrackingState } from './components/files/fileTreeTrackingState';
import { shouldAutoExpandFileSidebar } from './components/files/fileTreeVisibilityPolicy';
import { BackgroundLayer } from './components/layout/BackgroundLayer';
import { DeferredMainContent } from './components/layout/DeferredMainContent';
import { DeferredRepositorySidebar } from './components/layout/DeferredRepositorySidebar';
import { DeferredTreeSidebar } from './components/layout/DeferredTreeSidebar';
import { DeferredWorktreePanel } from './components/layout/DeferredWorktreePanel';
import { TemporaryWorkspacePanel } from './components/layout/TemporaryWorkspacePanel';
import { resolveTreeSidebarSelectedWorktrees } from './components/layout/treeSidebarSelectedWorktrees';
import { WindowTitleBar } from './components/layout/WindowTitleBar';
import { resolveWorktreePanelSnapshot } from './components/layout/worktreePanelSnapshot';
import { StartupShell } from './components/StartupShell';
import { addToast, toastManager } from './components/ui/toast';
import { useAutoFetchListener, useGitBranches, useGitInit } from './hooks/useGit';
import { useWebInspector } from './hooks/useWebInspector';
import {
  useWorktreeCreate,
  useWorktreeList,
  useWorktreeMerge,
  useWorktreeMergeAbort,
  useWorktreeMergeContinue,
  useWorktreeRemove,
  useWorktreeResolveConflict,
} from './hooks/useWorktree';
import { worktreeQueryKeys } from './hooks/worktreeQueryKeys';
import { useI18n } from './i18n';
import { getRendererEnvironment } from './lib/electronEnvironment';
import { buildOperationToastCopy, buildSourceControlWorkflowToastCopy } from './lib/feedbackCopy';
import { sanitizeGitWorktrees, sanitizeTempWorkspaceItems } from './lib/worktreeData';
import { useAgentSessionsStore } from './stores/agentSessions';
import { initCloneProgressListener } from './stores/cloneTasks';
import { useEditorStore } from './stores/editor';
import { useInitScriptStore } from './stores/initScript';
import { useSettingsStore } from './stores/settings';
import { useTempWorkspaceStore } from './stores/tempWorkspace';
import { useWorktreeStore } from './stores/worktree';
import { initAgentActivityListener, useWorktreeActivityStore } from './stores/worktreeActivity';

export default function App() {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  useEffect(() => {
    return initCloneProgressListener();
  }, []);

  // Initialize agent activity listener for tree sidebar status display
  useEffect(() => {
    return initAgentActivityListener();
  }, []);

  // Listen for auto-fetch completion events to refresh git status
  useAutoFetchListener();

  const repoState = useRepositoryState();
  const wtState = useWorktreeState();
  const panelState = usePanelState();

  const {
    repositories,
    selectedRepo,
    groups,
    activeGroupId,
    setSelectedRepo: setSelectedRepoState,
    setActiveGroupId,
    saveRepositories,
    handleCreateGroup,
    handleUpdateGroup,
    handleDeleteGroup,
    handleSwitchGroup,
    handleMoveToGroup,
    handleReorderRepositories,
  } = repoState;

  const {
    worktreeTabMap,
    repoWorktreeMap,
    tabOrder,
    activeTab,
    previousTab,
    activeWorktree,
    currentWorktreePathRef,
    setWorktreeTabMap,
    setRepoWorktreeMap,
    setActiveTab,
    setPreviousTab,
    setActiveWorktree,
    handleReorderWorktrees: reorderWorktreesInState,
    handleReorderTabs,
    getSortedWorktrees,
    saveActiveWorktreeToMap,
  } = wtState;

  const persistCurrentWorktreeTab = useCallback(
    (tab: TabId) => {
      if (!activeWorktree?.path) {
        return;
      }

      setWorktreeTabMap((prev) => {
        if (prev[activeWorktree.path] === tab) {
          return prev;
        }

        return {
          ...prev,
          [activeWorktree.path]: tab,
        };
      });
    },
    [activeWorktree?.path, setWorktreeTabMap]
  );

  const settingsState = useSettingsState(
    activeTab,
    previousTab,
    setActiveTab,
    setPreviousTab,
    persistCurrentWorktreeTab
  );

  const {
    settingsCategory,
    scrollToProvider,
    pendingProviderAction,
    settingsDialogOpen,
    settingsDisplayMode,
    setSettingsCategory,
    setScrollToProvider,
    setPendingProviderAction,
    openSettings,
    toggleSettings,
    handleSettingsCategoryChange,
    handleSettingsDialogOpenChange,
  } = settingsState;

  const {
    repositoryCollapsed,
    worktreeCollapsed,
    addRepoDialogOpen,
    initialLocalPath,
    actionPanelOpen,
    closeDialogOpen,
    toggleSelectedRepoExpandedRef,
    switchWorktreePathRef,
    setRepositoryCollapsed,
    setWorktreeCollapsed,
    setAddRepoDialogOpen,
    setInitialLocalPath,
    setActionPanelOpen,
    setCloseDialogOpen,
  } = panelState;

  const openLocalAddRepositoryDialog = useCallback(() => {
    setAddRepoDialogOpen(true);
  }, [setAddRepoDialogOpen]);

  const { isFileDragOver, repositorySidebarRef } = useFileDragDrop(
    true,
    setInitialLocalPath,
    openLocalAddRepositoryDialog
  );
  const [fileSidebarCollapsed, setFileSidebarCollapsed] = useState(() =>
    getStoredBoolean(STORAGE_KEYS.FILE_SIDEBAR_COLLAPSED, false)
  );
  const previousFileWorkspaceStateRef = useRef<{
    activeTab: TabId | null;
    worktreePath: string | null;
    activeFilePath: string | null;
  }>(createInitialFileSidebarTrackingState());

  const [activatedRemoteRepos, setActivatedRemoteRepos] = useState<Set<string>>(() => new Set());
  const [remoteStatuses, setRemoteStatuses] = useState<Record<string, RemoteConnectionStatus>>({});
  const [selectedSubagentByWorktree, setSelectedSubagentByWorktree] = useState<
    Record<string, LiveAgentSubagent | null>
  >({});

  const repositoryByPath = useMemo(
    () => new Map(repositories.map((repo) => [repo.path, repo])),
    [repositories]
  );

  useEffect(() => {
    return window.electronAPI.remote.onStatusChange(({ connectionId, status }) => {
      setRemoteStatuses((prev) => ({
        ...prev,
        [connectionId]: status,
      }));
    });
  }, []);

  const isRemoteRepoPath = useCallback(
    (repoPath: string | null | undefined) => {
      if (!repoPath || repoPath === TEMP_REPO_ID) {
        return false;
      }

      const repo = repositoryByPath.get(repoPath);
      return repo?.kind === 'remote' || isRemoteVirtualPath(repoPath);
    },
    [repositoryByPath]
  );

  const activateRemoteRepo = useCallback(
    (repoPath: string | null | undefined) => {
      if (!repoPath || !isRemoteRepoPath(repoPath)) {
        return;
      }

      const repo = repositoryByPath.get(repoPath);
      if (repo?.connectionId) {
        window.electronAPI.remote.connect(repo.connectionId).catch((error) => {
          console.warn('[remote] Failed to activate remote repository:', error);
        });
      }

      setActivatedRemoteRepos((prev) => {
        if (prev.has(repoPath)) {
          return prev;
        }
        const next = new Set(prev);
        next.add(repoPath);
        return next;
      });
    },
    [isRemoteRepoPath, repositoryByPath]
  );

  const canLoadRepo = useCallback(
    (repoPath: string | null | undefined) => {
      if (!repoPath || repoPath === TEMP_REPO_ID) {
        return false;
      }
      return !isRemoteRepoPath(repoPath) || activatedRemoteRepos.has(repoPath);
    },
    [activatedRemoteRepos, isRemoteRepoPath]
  );

  const setSelectedRepoForWorktreeSelection = useCallback(
    (repoPath: string) => {
      if (isRemoteRepoPath(repoPath)) {
        activateRemoteRepo(repoPath);
      }
      setSelectedRepoState(repoPath);
    },
    [activateRemoteRepo, isRemoteRepoPath, setSelectedRepoState]
  );

  const { refreshGitData, handleSelectWorktree } = useWorktreeSelection(
    activeWorktree,
    setActiveWorktree,
    currentWorktreePathRef,
    worktreeTabMap,
    setWorktreeTabMap,
    activeTab,
    previousTab,
    setActiveTab,
    selectedRepo,
    setSelectedRepoForWorktreeSelection,
    saveActiveWorktreeToMap
  );

  const {
    mergeDialogOpen,
    mergeWorktree,
    mergeConflicts,
    pendingMergeOptions,
    setMergeDialogOpen,
    setMergeConflicts,
    setPendingMergeOptions,
    handleOpenMergeDialog,
  } = useMergeState();

  // Layout mode from settings
  const layoutMode = useSettingsStore((s) => s.layoutMode);
  const autoUpdateEnabled = useSettingsStore((s) => s.autoUpdateEnabled);
  const hideGroups = useSettingsStore((s) => s.hideGroups);
  const temporaryWorkspaceEnabled = useSettingsStore((s) => s.temporaryWorkspaceEnabled);
  const fileTreeDisplayMode = useSettingsStore((s) => s.fileTreeDisplayMode);
  const defaultTemporaryPath = useSettingsStore((s) => s.defaultTemporaryPath);
  const rendererEnv = getRendererEnvironment();
  const isWindows = rendererEnv.platform === 'win32';
  const pathSep = isWindows ? '\\' : '/';
  const homeDir = rendererEnv.HOME;
  const effectiveTempBasePath = useMemo(
    () =>
      defaultTemporaryPath ||
      [homeDir, DEFAULT_WORKSPACE_ROOT_DIRNAME, DEFAULT_TEMPORARY_DIRNAME].join(pathSep),
    [defaultTemporaryPath, homeDir, pathSep]
  );
  const tempBasePathDisplay = useMemo(() => {
    if (!effectiveTempBasePath) return '';
    let display = effectiveTempBasePath.replace(/\\/g, '/');
    if (display.startsWith('/')) {
      display = display.slice(1);
    }
    if (!display.endsWith('/')) {
      display = `${display}/`;
    }
    return display;
  }, [effectiveTempBasePath]);
  const effectiveTemporaryWorkspaceEnabled = temporaryWorkspaceEnabled;
  const currentWorktreeTabToPersist = useMemo(
    () =>
      resolveWorktreeTabForPersistence({
        activeTab,
        previousTab,
        settingsDisplayMode,
      }),
    [activeTab, previousTab, settingsDisplayMode]
  );

  // Panel resize hook
  const {
    repositoryWidth,
    worktreeWidth,
    treeSidebarWidth,
    fileSidebarWidth,
    resizing,
    handleResizeStart,
  } = usePanelResize(layoutMode);

  const worktreeError = useWorktreeStore((s) => s.error);
  const setWorktreeError = useWorktreeStore((s) => s.setError);
  const setAgentActiveId = useAgentSessionsStore((state) => state.setActiveId);
  const activeEditorTabPath = useEditorStore((s) => s.activeTabPath);
  const currentEditorWorktreePath = useEditorStore((s) => s.currentWorktreePath);
  const clearEditorWorktreeState = useEditorStore((s) => s.clearWorktreeState);
  const tempWorkspaces = useTempWorkspaceStore((s) => s.items);
  const addTempWorkspace = useTempWorkspaceStore((s) => s.addItem);
  const removeTempWorkspace = useTempWorkspaceStore((s) => s.removeItem);
  const renameTempWorkspace = useTempWorkspaceStore((s) => s.renameItem);
  const rehydrateTempWorkspaces = useTempWorkspaceStore((s) => s.rehydrate);
  const openTempRename = useTempWorkspaceStore((s) => s.openRename);
  const openTempDelete = useTempWorkspaceStore((s) => s.openDelete);
  const safeTempWorkspaces = useMemo(
    () => sanitizeTempWorkspaceItems(tempWorkspaces),
    [tempWorkspaces]
  );

  // Handle tab change and persist to worktree tab map
  const handleTabChange = useCallback(
    (tab: TabId) => {
      setActiveTab(tab);
      // Clear previousTab when switching away from settings via tab bar
      if (activeTab === 'settings') {
        setPreviousTab(null);
      }
      // Save tab state for current worktree
      if (activeWorktree?.path) {
        setWorktreeTabMap((prev) => ({
          ...prev,
          [activeWorktree.path]: tab,
        }));
      }
    },
    [activeTab, activeWorktree, setActiveTab, setPreviousTab, setWorktreeTabMap]
  );

  useSettingsEvents(openSettings, setSettingsCategory, setScrollToProvider);

  // Keyboard shortcuts
  useAppKeyboardShortcuts({
    activeWorktreePath: activeWorktree?.path,
    onTabSwitch: handleTabChange,
    onActionPanelToggle: useCallback(
      () => setActionPanelOpen((prev) => !prev),
      [setActionPanelOpen]
    ),
    onToggleWorktree: useCallback(() => {
      // In tree layout, toggle selected repo expanded; in columns layout, toggle worktree panel
      if (layoutMode === 'tree') {
        toggleSelectedRepoExpandedRef.current?.();
      } else {
        setWorktreeCollapsed((prev) => !prev);
      }
    }, [layoutMode, setWorktreeCollapsed, toggleSelectedRepoExpandedRef.current]),
    onToggleRepository: useCallback(
      () => setRepositoryCollapsed((prev) => !prev),
      [setRepositoryCollapsed]
    ),
    onSwitchActiveWorktree: useCallback(() => {
      const activities = useWorktreeActivityStore.getState().activities;

      // 获取所有有活跃 agent 会话的 worktree 路径（跨所有仓库）
      const activeWorktreePaths = Object.entries(activities)
        .filter(([, activity]) => activity.agentCount > 0)
        .map(([path]) => path)
        .sort(); // 确保顺序稳定

      // 边界检查：少于 2 个活跃 worktree 时无需切换
      if (activeWorktreePaths.length < 2) {
        return;
      }

      // 找到当前 worktree 在列表中的位置
      const currentPath = activeWorktree?.path ?? '';
      const currentIndex = activeWorktreePaths.indexOf(currentPath);

      // 计算下一个索引（循环）
      const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % activeWorktreePaths.length;

      // 切换到下一个 worktree（使用 ref 调用跨仓库切换函数）
      const nextWorktreePath = activeWorktreePaths[nextIndex];
      switchWorktreePathRef.current?.(nextWorktreePath);
    }, [activeWorktree?.path, switchWorktreePathRef.current]),
  });

  // Web Inspector: listen for element inspection data and write to active agent terminal
  useWebInspector(activeWorktree?.path, selectedRepo ?? undefined);

  useTerminalNavigation(activeWorktree?.path ?? null, setActiveTab, setWorktreeTabMap);
  useMenuActions(openSettings, setActionPanelOpen);
  const { confirmCloseAndRespond, cancelCloseAndRespond } = useAppLifecycle(
    panelState.setCloseDialogOpen
  );
  useClaudeProviderListener(
    setSettingsCategory,
    setScrollToProvider,
    openSettings,
    setPendingProviderAction
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.FILE_SIDEBAR_COLLAPSED, String(fileSidebarCollapsed));
  }, [fileSidebarCollapsed]);

  const sortedGroups = useMemo(() => [...groups].sort((a, b) => a.order - b.order), [groups]);

  useTempWorkspaceSync(
    effectiveTemporaryWorkspaceEnabled,
    selectedRepo,
    activeWorktree,
    tempWorkspaces,
    repositories,
    setSelectedRepoState,
    setActiveWorktree
  );

  const isTempRepo = selectedRepo === TEMP_REPO_ID;
  const activeSelectedSubagent = activeWorktree
    ? (selectedSubagentByWorktree[normalizePath(activeWorktree.path)] ?? null)
    : null;
  const [pendingStartupBlockingKeys, setPendingStartupBlockingKeys] = useState<
    StartupBlockingKey[]
  >(() =>
    resolveInitialStartupBlockingKeys({
      layoutMode,
      repositoryCollapsed,
      worktreeCollapsed,
      isTempRepo,
      activeTab,
      hasActiveWorktree: Boolean(activeWorktree?.path),
      hasSelectedSubagent: Boolean(activeSelectedSubagent),
      settingsDisplayMode,
    })
  );
  const startupBlockingKeyCountRef = useRef(Math.max(pendingStartupBlockingKeys.length, 1));
  const startupProgress = useMemo(
    () =>
      resolveStartupProgress({
        pendingKeys: pendingStartupBlockingKeys,
        totalKeys: startupBlockingKeyCountRef.current,
      }),
    [pendingStartupBlockingKeys]
  );
  const startupBlockingCopy = startupProgress.currentKey
    ? resolveStartupBlockingCopy(startupProgress.currentKey)
    : null;
  const startupOverlayTitle = t(startupBlockingCopy?.title ?? 'Opening workspace');
  const startupOverlayDescription = t(
    startupBlockingCopy?.description ?? 'Restoring active context and preparing panels.'
  );
  const startupOverlayProgressLabel = t(startupBlockingCopy?.title ?? 'Opening workspace');
  const showStartupOverlay = pendingStartupBlockingKeys.length > 0;
  const worktreeRepoPath = isTempRepo ? null : selectedRepo;
  const selectedRepoCanLoad = canLoadRepo(worktreeRepoPath);
  const selectedRepository = worktreeRepoPath ? repositoryByPath.get(worktreeRepoPath) : null;
  const selectedRemoteStatus = selectedRepository?.connectionId
    ? (remoteStatuses[selectedRepository.connectionId] ?? null)
    : null;
  const selectedRemoteReady =
    !selectedRepository?.connectionId ||
    !isRemoteRepoPath(worktreeRepoPath) ||
    selectedRemoteStatus?.connected !== false ||
    selectedRemoteStatus == null;
  const worktreeQueryEnabled = Boolean(worktreeRepoPath && selectedRepoCanLoad);
  const inactiveSelectedRemoteRepo = Boolean(
    worktreeRepoPath &&
      isRemoteRepoPath(worktreeRepoPath) &&
      (!selectedRepoCanLoad || !selectedRemoteReady)
  );

  // Get worktrees for selected repo (used in columns mode)
  const {
    data: worktrees = [],
    isLoading: worktreesLoading,
    isFetching: worktreesFetching,
    isFetched: worktreesFetched,
    refetch,
  } = useWorktreeList(worktreeRepoPath, {
    enabled: worktreeQueryEnabled,
  });
  const safeWorktrees = useMemo(() => sanitizeGitWorktrees(worktrees), [worktrees]);
  const validatedSelectedWorktreePaths = useMemo(
    () => safeWorktrees.map((worktree) => worktree.path),
    [safeWorktrees]
  );

  // Get branches for selected repo
  const { data: branches = [], refetch: refetchBranches } = useGitBranches(worktreeRepoPath, {
    enabled: worktreeQueryEnabled,
  });

  // Worktree mutations
  const createWorktreeMutation = useWorktreeCreate();
  const removeWorktreeMutation = useWorktreeRemove();
  const gitInitMutation = useGitInit();

  // Merge mutations
  const mergeMutation = useWorktreeMerge();
  const resolveConflictMutation = useWorktreeResolveConflict();
  const abortMergeMutation = useWorktreeMergeAbort();
  const continueMergeMutation = useWorktreeMergeContinue();

  useEffect(() => {
    rehydrateTempWorkspaces();
  }, [rehydrateTempWorkspaces]);

  const handleStartupBlockingReady = useCallback((key: StartupBlockingKey) => {
    setPendingStartupBlockingKeys((previous) => markStartupBlockingKeyReady(previous, key));
  }, []);

  useEffect(() => {
    if (!inactiveSelectedRemoteRepo) {
      return;
    }
    setWorktreeError(null);
  }, [inactiveSelectedRemoteRepo, setWorktreeError]);

  useEffect(() => {
    if (!selectedRepo || selectedRepo === TEMP_REPO_ID) {
      return;
    }
    if (selectedRepoCanLoad || !activeWorktree) {
      return;
    }
    setActiveWorktree(null);
  }, [selectedRepo, selectedRepoCanLoad, activeWorktree, setActiveWorktree]);

  useEffect(() => {
    if (!selectedRepo) return;
    if (selectedRepo === TEMP_REPO_ID) return;

    const oldWorktreePath = localStorage.getItem(STORAGE_KEYS.ACTIVE_WORKTREE);
    const savedWorktreeMap = getStoredWorktreeMap();
    const needsMigration = oldWorktreePath && !savedWorktreeMap[selectedRepo];

    if (needsMigration && oldWorktreePath) {
      const migrated = {
        ...savedWorktreeMap,
        [selectedRepo]: oldWorktreePath,
      };
      localStorage.setItem(STORAGE_KEYS.ACTIVE_WORKTREES, JSON.stringify(migrated));
      setRepoWorktreeMap(migrated);
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_WORKTREE);
    }

    if (!selectedRepoCanLoad) return;

    if (!activeWorktree) {
      const savedWorktreePath = repoWorktreeMap[selectedRepo];
      if (!worktreesFetched) return;
      if (worktreesFetching) return;

      if (!savedWorktreePath) {
        const defaultWorktree = resolvePreferredWorktreeSelection(selectedRepo, safeWorktrees);
        if (defaultWorktree) {
          setActiveWorktree(defaultWorktree);
        }
        return;
      }

      const matchedWorktree = safeWorktrees.find((wt) => wt.path === savedWorktreePath);
      if (matchedWorktree) {
        setActiveWorktree(matchedWorktree);
        return;
      }

      // Remove stale saved mapping to avoid restore<->sync loops.
      setRepoWorktreeMap((prev) => {
        if (!prev[selectedRepo]) return prev;
        const updated = { ...prev };
        delete updated[selectedRepo];
        localStorage.setItem(STORAGE_KEYS.ACTIVE_WORKTREES, JSON.stringify(updated));
        return updated;
      });
    }
  }, [
    selectedRepo,
    activeWorktree,
    repoWorktreeMap,
    selectedRepoCanLoad,
    safeWorktrees,
    worktreesFetched,
    worktreesFetching,
    setRepoWorktreeMap,
    setActiveWorktree,
  ]);

  useStartupAgentSessionRecovery({
    selectedRepo,
    activeWorktree,
    selectedRepoCanLoad,
    worktreesFetched,
    worktreesFetching,
    availableWorktreePaths: validatedSelectedWorktreePaths,
  });

  const sortedWorktrees = useMemo(
    () => getSortedWorktrees(selectedRepo, safeWorktrees),
    [getSortedWorktrees, selectedRepo, safeWorktrees]
  );
  const mainContentRepoPath = useMemo(
    () =>
      resolveMainContentRepoPath({
        selectedRepo,
        activeWorktree,
        selectedRepoWorktrees: safeWorktrees,
        repoWorktreeMap,
      }),
    [selectedRepo, activeWorktree, safeWorktrees, repoWorktreeMap]
  );
  const cachedSelectedRepoWorktrees = useMemo(() => {
    const cachedWorktrees = queryClient.getQueryData<GitWorktree[]>(
      worktreeQueryKeys.list(worktreeRepoPath)
    );
    return getSortedWorktrees(selectedRepo, sanitizeGitWorktrees(cachedWorktrees));
  }, [getSortedWorktrees, queryClient, selectedRepo, worktreeRepoPath]);
  const visibleWorktrees = useMemo(
    () =>
      resolveWorktreePanelSnapshot({
        worktrees: sortedWorktrees,
        cachedWorktrees: cachedSelectedRepoWorktrees,
        activeWorktree,
      }),
    [sortedWorktrees, cachedSelectedRepoWorktrees, activeWorktree]
  );
  const treeSidebarWorktrees = useMemo(
    () =>
      resolveTreeSidebarSelectedWorktrees({
        worktrees: sortedWorktrees,
        cachedWorktrees: cachedSelectedRepoWorktrees,
      }),
    [sortedWorktrees, cachedSelectedRepoWorktrees]
  );
  const shouldShowWorktreePanelLoading =
    worktreeQueryEnabled &&
    visibleWorktrees.length === 0 &&
    (!worktreesFetched || worktreesFetching);
  const { shouldRender: shouldRenderFileSidebar, rootPath: fileSidebarRootPath } =
    resolveFileSidebarVisibility({
      fileTreeDisplayMode,
      activeWorktreePath: activeWorktree?.path ?? null,
      editorWorktreePath: currentEditorWorktreePath,
      activeFilePath: activeEditorTabPath,
      candidateWorktreePaths: visibleWorktrees.map((worktree) => worktree.path),
    });

  useEffect(() => {
    const previousState = previousFileWorkspaceStateRef.current;
    const nextWorktreePath = fileSidebarRootPath;

    if (
      shouldAutoExpandFileSidebar({
        activeTab,
        previousActiveTab: previousState.activeTab,
        fileTreeDisplayMode,
        hasActiveWorktree: shouldRenderFileSidebar,
        isFileSidebarCollapsed: fileSidebarCollapsed,
        worktreePath: nextWorktreePath,
        previousWorktreePath: previousState.worktreePath,
        activeFilePath: activeEditorTabPath,
        previousActiveFilePath: previousState.activeFilePath,
      })
    ) {
      setFileSidebarCollapsed(false);
    }

    previousFileWorkspaceStateRef.current = {
      activeTab,
      worktreePath: nextWorktreePath,
      activeFilePath: activeEditorTabPath,
    };
  }, [
    activeTab,
    activeEditorTabPath,
    fileSidebarRootPath,
    fileSidebarCollapsed,
    fileTreeDisplayMode,
    shouldRenderFileSidebar,
  ]);

  useGroupSync(hideGroups, activeGroupId, groups, setActiveGroupId, saveActiveGroupId);
  useOpenPathListener(true, repositories, saveRepositories, setSelectedRepoState);
  useClaudeIntegration(activeWorktree?.path ?? null, true);
  useCodeReviewContinue(activeWorktree, handleTabChange);
  useWorktreeSync(
    safeWorktrees,
    activeWorktree,
    selectedRepoCanLoad,
    worktreesFetched,
    worktreesFetching,
    Boolean(worktreeError),
    setActiveWorktree
  );

  const handleReorderWorktrees = useCallback(
    (fromIndex: number, toIndex: number) => {
      reorderWorktreesInState(selectedRepo, safeWorktrees, fromIndex, toIndex);
    },
    [selectedRepo, safeWorktrees, reorderWorktreesInState]
  );

  // Remove repository from workspace
  const handleRemoveRepository = useCallback(
    (repoPath: string) => {
      const updated = repositories.filter((r) => r.path !== repoPath);
      saveRepositories(updated);
      setActivatedRemoteRepos((prev) => {
        if (!prev.has(repoPath)) {
          return prev;
        }
        const next = new Set(prev);
        next.delete(repoPath);
        return next;
      });
      // Clear selection if removed repo was selected
      if (selectedRepo === repoPath) {
        setSelectedRepoState(null);
        setActiveWorktree(null);
      }
    },
    [repositories, saveRepositories, selectedRepo, setActiveWorktree, setSelectedRepoState]
  );

  useEffect(() => {
    if (!selectedRepo || selectedRepo === TEMP_REPO_ID) return;
    if (!selectedRepoCanLoad) return;
    if (!worktreesFetched) return;
    if (worktreesFetching) return;

    if (!activeWorktree) {
      saveActiveWorktreeToMap(selectedRepo, null);
      return;
    }

    const isWorktreeInSelectedRepo = safeWorktrees.some((wt) => wt.path === activeWorktree.path);
    if (isWorktreeInSelectedRepo) {
      saveActiveWorktreeToMap(selectedRepo, activeWorktree);
    }
  }, [
    selectedRepo,
    activeWorktree,
    selectedRepoCanLoad,
    safeWorktrees,
    worktreesFetched,
    worktreesFetching,
    saveActiveWorktreeToMap,
  ]);

  const handleSelectRepo = useCallback(
    (repoPath: string, options?: { activateRemote?: boolean }) => {
      // Save current worktree's tab state before switching
      if (activeWorktree?.path) {
        setWorktreeTabMap((prev) => ({
          ...prev,
          [activeWorktree.path]: currentWorktreeTabToPersist,
        }));
      }

      const shouldActivateRemote = (options?.activateRemote ?? false) && isRemoteRepoPath(repoPath);
      if (shouldActivateRemote) {
        activateRemoteRepo(repoPath);
      }

      const nextRepoCanLoad =
        repoPath !== TEMP_REPO_ID &&
        (!isRemoteRepoPath(repoPath) || shouldActivateRemote || activatedRemoteRepos.has(repoPath));

      setSelectedRepoState(repoPath);

      if (!nextRepoCanLoad) {
        setActiveWorktree(null);
        setActiveTab('chat');
        return;
      }

      const savedWorktreePath = repoWorktreeMap[repoPath];
      if (savedWorktreePath) {
        // Set temporary worktree with just the path; full object syncs after worktrees load.
        setActiveWorktree({ path: savedWorktreePath } as GitWorktree);
        const savedTab = resolveWorktreeTabForRestore({
          savedTab: worktreeTabMap[savedWorktreePath],
          settingsDisplayMode,
        });
        setActiveTab(savedTab);
        return;
      }

      setActiveWorktree(null);
      setActiveTab('chat');
    },
    [
      activeWorktree,
      activateRemoteRepo,
      activatedRemoteRepos,
      currentWorktreeTabToPersist,
      isRemoteRepoPath,
      repoWorktreeMap,
      settingsDisplayMode,
      setActiveTab,
      setActiveWorktree,
      setSelectedRepoState,
      setWorktreeTabMap,
      worktreeTabMap,
    ]
  );

  const closeAgentSessions = useWorktreeActivityStore((s) => s.closeAgentSessions);
  const closeTerminalSessions = useWorktreeActivityStore((s) => s.closeTerminalSessions);
  const clearWorktreeActivity = useWorktreeActivityStore((s) => s.clearWorktree);
  const { handleSelectTempWorkspace, handleCreateTempWorkspace, handleRemoveTempWorkspace } =
    useTempWorkspaceActions({
      activeWorktreePath: activeWorktree?.path ?? null,
      effectiveTempBasePath,
      safeTempWorkspaces,
      t,
      addTempWorkspace,
      removeTempWorkspace,
      clearEditorWorktreeState,
      clearWorktreeActivity,
      closeAgentSessions,
      closeTerminalSessions,
      setActiveWorktree,
      selectWorktree: handleSelectWorktree,
    });

  const handleSwitchWorktreePath = useCallback(
    async (worktreePath: string) => {
      const tempMatch = safeTempWorkspaces.find((item) => item.path === worktreePath);
      if (tempMatch) {
        await handleSelectWorktree({ path: tempMatch.path } as GitWorktree, TEMP_REPO_ID);
        return;
      }

      const worktree = safeWorktrees.find((wt) => wt.path === worktreePath);
      if (worktree) {
        handleSelectWorktree(worktree);
        return;
      }

      for (const repo of repositories) {
        if (isRemoteRepoPath(repo.path) && !canLoadRepo(repo.path)) {
          continue;
        }

        try {
          const repoWorktrees = await window.electronAPI.worktree.list(repo.path);
          const safeRepoWorktrees = sanitizeGitWorktrees(
            Array.isArray(repoWorktrees) ? repoWorktrees : []
          );
          const found = safeRepoWorktrees.find((wt) => wt.path === worktreePath);
          if (found) {
            setSelectedRepoForWorktreeSelection(repo.path);
            setActiveWorktree(found);
            const savedTab = resolveWorktreeTabForRestore({
              savedTab: worktreeTabMap[found.path],
              settingsDisplayMode,
            });
            setActiveTab(savedTab);

            // Refresh git data for the switched worktree
            refreshGitData(found.path);
            return;
          }
        } catch {}
      }
    },
    [
      safeTempWorkspaces,
      safeWorktrees,
      repositories,
      isRemoteRepoPath,
      canLoadRepo,
      settingsDisplayMode,
      worktreeTabMap,
      handleSelectWorktree,
      refreshGitData,
      setActiveTab,
      setActiveWorktree,
      setSelectedRepoForWorktreeSelection,
    ]
  );

  // Assign to ref for use in keyboard shortcut callback
  switchWorktreePathRef.current = handleSwitchWorktreePath;

  // Handle adding a local repository
  const createRepositoryEntry = useCallback(
    (
      repoPath: string,
      groupId: string | null,
      options?: { kind?: 'local' | 'remote'; connectionId?: string }
    ): Repository => ({
      id: buildRepositoryId(options?.kind ?? 'local', repoPath, {
        connectionId: options?.connectionId,
        platform:
          rendererEnv.platform === 'win32'
            ? 'win32'
            : rendererEnv.platform === 'darwin'
              ? 'darwin'
              : 'linux',
      }),
      name: getDisplayPathBasename(repoPath),
      path: repoPath,
      kind: options?.kind ?? 'local',
      connectionId: options?.connectionId,
      groupId: groupId || undefined,
    }),
    [rendererEnv.platform]
  );

  const findExistingRepository = useCallback(
    (candidate: Repository) =>
      repositories.find((repo) => repo.id === candidate.id || repo.path === candidate.path),
    [repositories]
  );

  const handleAddLocalRepository = useCallback(
    (selectedPath: string, groupId: string | null) => {
      const candidate = createRepositoryEntry(selectedPath, groupId);
      const existingRepo = findExistingRepository(candidate);
      if (existingRepo) {
        handleSelectRepo(existingRepo.path);
        return;
      }

      const updated = [...repositories, candidate];
      saveRepositories(updated);

      handleSelectRepo(candidate.path);
    },
    [
      createRepositoryEntry,
      findExistingRepository,
      handleSelectRepo,
      repositories,
      saveRepositories,
    ]
  );

  // Handle cloning a remote repository
  const handleCloneRepository = useCallback(
    (clonedPath: string, groupId: string | null) => {
      const candidate = createRepositoryEntry(clonedPath, groupId);
      const existingRepo = findExistingRepository(candidate);
      if (existingRepo) {
        handleSelectRepo(existingRepo.path);
        return;
      }

      const updated = [...repositories, candidate];
      saveRepositories(updated);

      handleSelectRepo(candidate.path);
    },
    [
      createRepositoryEntry,
      findExistingRepository,
      handleSelectRepo,
      repositories,
      saveRepositories,
    ]
  );

  const handleAddRemoteRepository = useCallback(
    async (remoteRepoPath: string, groupId: string | null, connectionId: string) => {
      const candidate = createRepositoryEntry(
        toRemoteVirtualPath(connectionId, remoteRepoPath),
        groupId,
        {
          kind: 'remote',
          connectionId,
        }
      );
      const existingRepo = findExistingRepository(candidate);
      if (existingRepo) {
        handleSelectRepo(existingRepo.path);
        return;
      }

      const updated = [...repositories, candidate];
      saveRepositories(updated);
      handleSelectRepo(candidate.path);
    },
    [
      createRepositoryEntry,
      findExistingRepository,
      handleSelectRepo,
      repositories,
      saveRepositories,
    ]
  );

  const handleOpenRepositoryDialog = useCallback(() => {
    setAddRepoDialogOpen(true);
  }, [setAddRepoDialogOpen]);

  const handleAddRepoDialogOpenChange = useCallback(
    (open: boolean) => {
      setAddRepoDialogOpen(open);
    },
    [setAddRepoDialogOpen]
  );

  const setPendingScript = useInitScriptStore((s) => s.setPendingScript);

  const handleCreateWorktree = async (options: WorktreeCreateOptions) => {
    if (!selectedRepo) return;
    try {
      await createWorktreeMutation.mutateAsync({
        workdir: selectedRepo,
        options,
      });

      const repoSettings = getRepositorySettings(selectedRepo);
      if (repoSettings.autoInitWorktree) {
        const newWorktreePath = options.path;
        const newWorktree: GitWorktree = {
          path: newWorktreePath,
          head: '',
          branch: options.newBranch || options.branch || null,
          isMainWorktree: false,
          isLocked: false,
          prunable: false,
        };

        handleSelectWorktree(newWorktree);

        if (repoSettings.initScript.trim()) {
          setPendingScript({
            worktreePath: newWorktreePath,
            script: repoSettings.initScript,
          });
          setActiveTab('terminal');
        }
      }
    } finally {
      refetchBranches();
    }
  };

  const handleRemoveWorktree = (
    worktree: GitWorktree,
    options?: { deleteBranch?: boolean; force?: boolean }
  ) => {
    if (!selectedRepo) return;

    const loadingCopy = buildOperationToastCopy(
      {
        phase: 'loading',
        kind: 'worktree',
        action: 'delete',
        label: worktree.branch || getDisplayPath(worktree.path),
      },
      t
    );
    const toastId = toastManager.add({
      type: 'loading',
      title: loadingCopy.title,
      description: loadingCopy.description,
      timeout: 0,
    });

    // Execute deletion asynchronously (non-blocking)
    removeWorktreeMutation
      .mutateAsync({
        workdir: selectedRepo,
        options: {
          path: worktree.path,
          force: worktree.prunable || options?.force,
          deleteBranch: options?.deleteBranch,
          branch: worktree.branch || undefined,
        },
      })
      .then(() => {
        // Clear editor state for the removed worktree
        clearEditorWorktreeState(worktree.path);
        // Clear selection if the active worktree was removed
        if (activeWorktree?.path === worktree.path) {
          setActiveWorktree(null);
        }
        refetchBranches();

        toastManager.close(toastId);
        const successCopy = buildOperationToastCopy(
          {
            phase: 'success',
            kind: 'worktree',
            action: 'delete',
            label: worktree.branch || getDisplayPath(worktree.path),
          },
          t
        );
        toastManager.add({
          type: 'success',
          title: successCopy.title,
          description: successCopy.description,
        });
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        const hasUncommitted = message.includes('modified or untracked');

        toastManager.close(toastId);
        const errorCopy = buildOperationToastCopy(
          {
            phase: 'error',
            kind: 'worktree',
            action: 'delete',
            message: hasUncommitted
              ? t('This directory contains uncommitted changes. Please check "Force delete".')
              : message,
          },
          t
        );
        toastManager.add({
          type: 'error',
          title: errorCopy.title,
          description: errorCopy.description,
        });
      });
  };

  const handleInitGit = async () => {
    if (!selectedRepo) return;
    try {
      await gitInitMutation.mutateAsync(selectedRepo);
      // Refresh worktrees and branches after init
      await refetch();
      await refetchBranches();
    } catch (error) {
      console.error('Failed to initialize git repository:', error);
    }
  };

  const handleMerge = async (options: WorktreeMergeOptions): Promise<WorktreeMergeResult> => {
    if (!selectedRepo) {
      return { success: false, merged: false, error: 'No repository selected' };
    }
    return mergeMutation.mutateAsync({ workdir: selectedRepo, options });
  };

  const handleMergeConflicts = (result: WorktreeMergeResult, options: WorktreeMergeOptions) => {
    setMergeDialogOpen(false); // Close merge dialog first
    setMergeConflicts(result);
    // Store the merge options for cleanup after conflict resolution
    setPendingMergeOptions({
      worktreePath: options.worktreePath,
      sourceBranch: mergeWorktree?.branch || '',
      deleteWorktreeAfterMerge: options.deleteWorktreeAfterMerge,
      deleteBranchAfterMerge: options.deleteBranchAfterMerge,
    });

    // Notify user if changes were stashed, with specific paths
    const stashedPaths: string[] = [];
    if (result.mainStashStatus === 'stashed' && result.mainWorktreePath) {
      stashedPaths.push(result.mainWorktreePath);
    }
    if (result.worktreeStashStatus === 'stashed' && result.worktreePath) {
      stashedPaths.push(result.worktreePath);
    }
    if (stashedPaths.length > 0) {
      const copy = buildSourceControlWorkflowToastCopy(
        {
          action: 'merge-stash',
          phase: 'success',
          paths: stashedPaths,
        },
        t
      );
      toastManager.add({
        type: 'info',
        title: copy.title,
        description: copy.description,
      });
    }
  };

  const handleResolveConflict = async (file: string, content: string) => {
    if (!selectedRepo) return;
    await resolveConflictMutation.mutateAsync({
      workdir: selectedRepo,
      resolution: { file, content },
    });
  };

  const handleAbortMerge = async () => {
    if (!selectedRepo) return;
    await abortMergeMutation.mutateAsync({ workdir: selectedRepo });
    setMergeConflicts(null);
    setPendingMergeOptions(null);
    refetch();
  };

  const handleCompleteMerge = async (message: string) => {
    if (!selectedRepo) return;
    const result = await continueMergeMutation.mutateAsync({
      workdir: selectedRepo,
      message,
      cleanupOptions: pendingMergeOptions || undefined,
    });
    if (result.success) {
      // Show warnings if any (combined into a single toast)
      if (result.warnings && result.warnings.length > 0) {
        const copy = buildSourceControlWorkflowToastCopy(
          {
            action: 'merge-warning',
            phase: 'success',
            warnings: result.warnings,
          },
          t
        );
        addToast({
          type: 'warning',
          title: copy.title,
          description: copy.description,
        });
      }
      setMergeConflicts(null);
      setPendingMergeOptions(null);
      refetch();
      refetchBranches();
    }
  };

  const getConflictContent = async (file: string) => {
    if (!selectedRepo) throw new Error('No repository selected');
    return window.electronAPI.worktree.getConflictContent(selectedRepo, file);
  };

  const handleOpenAgentThread = useCallback(
    async (worktree: GitWorktree, sessionId: string) => {
      await handleSelectWorktree(worktree);
      setSelectedSubagentByWorktree((previous) => ({
        ...previous,
        [normalizePath(worktree.path)]: null,
      }));
      setAgentActiveId(worktree.path, sessionId);
      handleTabChange('chat');
    },
    [handleSelectWorktree, handleTabChange, setAgentActiveId]
  );

  const handleOpenSubagentTranscript = useCallback(
    async (worktree: GitWorktree, subagent: LiveAgentSubagent) => {
      await handleSelectWorktree(worktree);
      setSelectedSubagentByWorktree((previous) => ({
        ...previous,
        [normalizePath(worktree.path)]: subagent,
      }));
      handleTabChange('chat');
    },
    [handleSelectWorktree, handleTabChange]
  );

  useEffect(() => {
    const isSettingsOpen =
      (settingsDisplayMode === 'tab' && activeTab === 'settings') ||
      (settingsDisplayMode === 'draggable-modal' && settingsDialogOpen);

    if (!isSettingsOpen) return;
    if (!pendingProviderAction) return;

    const eventName =
      pendingProviderAction === 'preview'
        ? 'open-settings-provider-preview'
        : 'open-settings-provider-save';

    window.dispatchEvent(new CustomEvent(eventName));
    setPendingProviderAction(null);
  }, [
    settingsDisplayMode,
    settingsDialogOpen,
    activeTab,
    pendingProviderAction,
    setPendingProviderAction,
  ]);

  useBackgroundImage();

  return (
    <div className="relative z-0 flex h-screen flex-col overflow-hidden">
      <BackgroundLayer />
      {/* Custom Title Bar for Windows/Linux */}
      <WindowTitleBar onOpenSettings={openSettings} />

      {/* DevTools Overlay for macOS traffic lights protection */}
      <DevToolsOverlay />

      {/* Main Layout */}
      <div className={`flex flex-1 overflow-hidden ${resizing ? 'select-none' : ''}`}>
        {layoutMode === 'tree' ? (
          // Tree Layout: Single sidebar with repos as root nodes and worktrees as children
          <AnimatePresence initial={false}>
            {!repositoryCollapsed && (
              <motion.div
                ref={repositorySidebarRef}
                key="tree-sidebar"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: treeSidebarWidth, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={panelTransition}
                className="relative h-full shrink-0 overflow-hidden"
              >
                <DeferredTreeSidebar
                  onReady={() => handleStartupBlockingReady('tree-sidebar')}
                  repositories={repositories}
                  selectedRepo={selectedRepo}
                  activeWorktree={activeWorktree}
                  worktrees={treeSidebarWorktrees}
                  branches={branches}
                  isLoading={worktreesLoading || shouldShowWorktreePanelLoading}
                  isFetching={worktreesFetching}
                  isCreating={createWorktreeMutation.isPending}
                  error={worktreeError}
                  onSelectRepo={handleSelectRepo}
                  canLoadRepo={(repoPath) => canLoadRepo(repoPath)}
                  onActivateRemoteRepo={activateRemoteRepo}
                  onSelectWorktree={handleSelectWorktree}
                  onAddRepository={handleOpenRepositoryDialog}
                  onRemoveRepository={handleRemoveRepository}
                  onCreateWorktree={handleCreateWorktree}
                  onRemoveWorktree={handleRemoveWorktree}
                  onMergeWorktree={handleOpenMergeDialog}
                  onReorderRepositories={handleReorderRepositories}
                  onReorderWorktrees={handleReorderWorktrees}
                  onRefresh={() => {
                    refetch();
                    refetchBranches();
                  }}
                  onInitGit={handleInitGit}
                  onOpenSettings={openSettings}
                  collapsed={false}
                  onCollapse={() => setRepositoryCollapsed(true)}
                  groups={sortedGroups}
                  activeGroupId={activeGroupId}
                  onSwitchGroup={handleSwitchGroup}
                  onCreateGroup={handleCreateGroup}
                  onUpdateGroup={handleUpdateGroup}
                  onDeleteGroup={handleDeleteGroup}
                  onMoveToGroup={handleMoveToGroup}
                  onSwitchTab={setActiveTab}
                  onSwitchWorktreeByPath={handleSwitchWorktreePath}
                  onOpenAgentThread={handleOpenAgentThread}
                  onOpenSubagentTranscript={handleOpenSubagentTranscript}
                  isChatActive={activeTab === 'chat'}
                  selectedSubagentByWorktree={selectedSubagentByWorktree}
                  temporaryWorkspaceEnabled={effectiveTemporaryWorkspaceEnabled}
                  tempWorkspaces={safeTempWorkspaces}
                  tempBasePath={tempBasePathDisplay}
                  onSelectTempWorkspace={handleSelectTempWorkspace}
                  onCreateTempWorkspace={handleCreateTempWorkspace}
                  onRequestTempRename={openTempRename}
                  onRequestTempDelete={openTempDelete}
                  toggleSelectedRepoExpandedRef={toggleSelectedRepoExpandedRef}
                  isSettingsActive={activeTab === 'settings'}
                  onToggleSettings={toggleSettings}
                  isFileDragOver={isFileDragOver}
                />
                {/* Resize handle */}
                <div
                  className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-primary/20 active:bg-primary/30 transition-colors z-10"
                  onMouseDown={handleResizeStart('repository')}
                />
              </motion.div>
            )}
          </AnimatePresence>
        ) : (
          // Columns Layout: Separate repo sidebar and worktree panel
          <>
            {/* Column 1: Repository Sidebar */}
            <AnimatePresence initial={false}>
              {!repositoryCollapsed && (
                <motion.div
                  ref={repositorySidebarRef}
                  key="repository"
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: repositoryWidth, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={panelTransition}
                  className="relative h-full shrink-0 overflow-hidden"
                >
                  <DeferredRepositorySidebar
                    onReady={() => handleStartupBlockingReady('repository-sidebar')}
                    repositories={repositories}
                    selectedRepo={selectedRepo}
                    onSelectRepo={handleSelectRepo}
                    canLoadRepo={canLoadRepo}
                    onAddRepository={handleOpenRepositoryDialog}
                    onRemoveRepository={handleRemoveRepository}
                    onReorderRepositories={handleReorderRepositories}
                    onOpenSettings={openSettings}
                    collapsed={false}
                    onCollapse={() => setRepositoryCollapsed(true)}
                    groups={sortedGroups}
                    activeGroupId={activeGroupId}
                    onSwitchGroup={handleSwitchGroup}
                    onCreateGroup={handleCreateGroup}
                    onUpdateGroup={handleUpdateGroup}
                    onDeleteGroup={handleDeleteGroup}
                    onMoveToGroup={handleMoveToGroup}
                    onSwitchTab={setActiveTab}
                    onSwitchWorktreeByPath={handleSwitchWorktreePath}
                    isSettingsActive={activeTab === 'settings'}
                    onToggleSettings={toggleSettings}
                    isFileDragOver={isFileDragOver}
                    temporaryWorkspaceEnabled={effectiveTemporaryWorkspaceEnabled}
                    tempBasePath={tempBasePathDisplay}
                    tempWorkspaceCount={safeTempWorkspaces.length}
                    hasActiveTempWorkspace={
                      selectedRepo === TEMP_REPO_ID &&
                      !!activeWorktree &&
                      safeTempWorkspaces.some((item) => item.path === activeWorktree.path)
                    }
                  />
                  {/* Resize handle */}
                  <div
                    className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-primary/20 active:bg-primary/30 transition-colors z-10"
                    onMouseDown={handleResizeStart('repository')}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Column 2: Worktree Panel */}
            <AnimatePresence initial={false}>
              {!worktreeCollapsed && (
                <motion.div
                  key="worktree"
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: worktreeWidth, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={panelTransition}
                  className="relative h-full shrink-0 overflow-hidden"
                >
                  {isTempRepo ? (
                    <TemporaryWorkspacePanel
                      items={safeTempWorkspaces}
                      activePath={activeWorktree?.path ?? null}
                      onSelect={(item) => handleSelectTempWorkspace(item.path)}
                      onCreate={handleCreateTempWorkspace}
                      onRequestRename={(id) => openTempRename(id)}
                      onRequestDelete={(id) => openTempDelete(id)}
                      onRefresh={rehydrateTempWorkspaces}
                      onCollapse={() => setWorktreeCollapsed(true)}
                    />
                  ) : (
                    <DeferredWorktreePanel
                      onReady={() => handleStartupBlockingReady('worktree-panel')}
                      worktrees={visibleWorktrees}
                      activeWorktree={activeWorktree}
                      branches={branches}
                      projectName={selectedRepo ? getDisplayPathBasename(selectedRepo) : ''}
                      inactiveRemote={inactiveSelectedRemoteRepo}
                      remoteStatus={selectedRemoteStatus}
                      isLoading={worktreesLoading || shouldShowWorktreePanelLoading}
                      isCreating={createWorktreeMutation.isPending}
                      error={inactiveSelectedRemoteRepo ? null : worktreeError}
                      onSelectWorktree={handleSelectWorktree}
                      onCreateWorktree={handleCreateWorktree}
                      onRemoveWorktree={handleRemoveWorktree}
                      onMergeWorktree={handleOpenMergeDialog}
                      onReorderWorktrees={handleReorderWorktrees}
                      onInitGit={handleInitGit}
                      onRefresh={() => {
                        refetch();
                        refetchBranches();
                      }}
                      onOpenAgentThread={handleOpenAgentThread}
                      onOpenSubagentTranscript={handleOpenSubagentTranscript}
                      isChatActive={activeTab === 'chat'}
                      selectedSubagentByWorktree={selectedSubagentByWorktree}
                      width={worktreeWidth}
                      collapsed={false}
                      onCollapse={() => setWorktreeCollapsed(true)}
                      repositoryCollapsed={repositoryCollapsed}
                      onExpandRepository={() => setRepositoryCollapsed(false)}
                    />
                  )}
                  {/* Resize handle */}
                  <div
                    className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-primary/20 active:bg-primary/30 transition-colors z-10"
                    onMouseDown={handleResizeStart('worktree')}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

        {/* Main Content */}
        {shouldRenderFileSidebar && (
          <FileSidebar
            rootPath={fileSidebarRootPath ?? undefined}
            isActive={activeTab === 'file'}
            width={fileSidebarWidth}
            collapsed={fileSidebarCollapsed}
            onCollapse={() => setFileSidebarCollapsed(true)}
            onResizeStart={handleResizeStart('fileSidebar')}
            onSwitchTab={() => handleTabChange('file')}
          />
        )}

        <DeferredMainContent
          onStartupBlockingReady={handleStartupBlockingReady}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          tabOrder={tabOrder}
          onTabReorder={handleReorderTabs}
          repoPath={mainContentRepoPath || undefined}
          worktreePath={activeWorktree?.path}
          repositoryCollapsed={repositoryCollapsed}
          worktreeCollapsed={layoutMode === 'tree' ? repositoryCollapsed : worktreeCollapsed}
          fileSidebarCollapsed={shouldRenderFileSidebar ? fileSidebarCollapsed : false}
          layoutMode={layoutMode}
          onExpandRepository={() => setRepositoryCollapsed(false)}
          onExpandWorktree={
            layoutMode === 'tree'
              ? () => setRepositoryCollapsed(false)
              : () => setWorktreeCollapsed(false)
          }
          onExpandFileSidebar={
            shouldRenderFileSidebar ? () => setFileSidebarCollapsed(false) : undefined
          }
          onSwitchWorktree={handleSwitchWorktreePath}
          onSwitchTab={handleTabChange}
          isSettingsActive={
            (settingsDisplayMode === 'tab' && activeTab === 'settings') ||
            (settingsDisplayMode === 'draggable-modal' && settingsDialogOpen)
          }
          settingsCategory={settingsCategory}
          onCategoryChange={handleSettingsCategoryChange}
          scrollToProvider={scrollToProvider}
          onToggleSettings={toggleSettings}
          selectedSubagent={activeSelectedSubagent}
          onCloseSelectedSubagent={() => {
            if (!activeWorktree) {
              return;
            }

            setSelectedSubagentByWorktree((previous) => ({
              ...previous,
              [normalizePath(activeWorktree.path)]: null,
            }));
          }}
        />

        <AppOverlays
          onConfirmTempWorkspaceDelete={handleRemoveTempWorkspace}
          onConfirmTempWorkspaceRename={renameTempWorkspace}
          addRepositoryOpen={addRepoDialogOpen}
          onAddRepositoryOpenChange={handleAddRepoDialogOpenChange}
          addRepositoryGroups={sortedGroups}
          addRepositoryDefaultGroupId={activeGroupId === ALL_GROUP_ID ? null : activeGroupId}
          onAddLocalRepository={handleAddLocalRepository}
          onCloneRepository={handleCloneRepository}
          onAddRemoteRepository={handleAddRemoteRepository}
          onCreateRepositoryGroup={handleCreateGroup}
          initialLocalPath={initialLocalPath ?? undefined}
          onClearInitialLocalPath={() => setInitialLocalPath(null)}
          actionPanelOpen={actionPanelOpen}
          onActionPanelOpenChange={setActionPanelOpen}
          repositoryCollapsed={repositoryCollapsed}
          worktreeCollapsed={worktreeCollapsed}
          actionPanelProjectPath={activeWorktree?.path || selectedRepo || undefined}
          actionPanelRepositories={repositories}
          actionPanelSelectedRepoPath={selectedRepo ?? undefined}
          actionPanelWorktrees={worktrees}
          actionPanelActiveWorktreePath={activeWorktree?.path}
          onToggleRepositoryPanel={() => setRepositoryCollapsed((prev) => !prev)}
          onToggleWorktreePanel={() => setWorktreeCollapsed((prev) => !prev)}
          onOpenSettings={openSettings}
          onSwitchRepository={(repoPath) => handleSelectRepo(repoPath, { activateRemote: true })}
          onSwitchWorktree={handleSelectWorktree}
          autoUpdateEnabled={autoUpdateEnabled}
          closeDialogOpen={closeDialogOpen}
          setCloseDialogOpen={setCloseDialogOpen}
          onDismissCloseDialog={cancelCloseAndRespond}
          onCancelClose={cancelCloseAndRespond}
          onConfirmClose={confirmCloseAndRespond}
          mergeWorktree={mergeWorktree}
          mergeDialogOpen={mergeDialogOpen}
          onMergeDialogOpenChange={setMergeDialogOpen}
          mergeBranches={branches}
          mergeLoading={mergeMutation.isPending}
          onMerge={handleMerge}
          onMergeConflicts={handleMergeConflicts}
          onMergeSuccess={({ deletedWorktree }) => {
            if (deletedWorktree && mergeWorktree) {
              clearEditorWorktreeState(mergeWorktree.path);
              if (activeWorktree?.path === mergeWorktree.path) {
                setActiveWorktree(null);
              }
            }
            refetch();
            refetchBranches();
          }}
          mergeConflicts={mergeConflicts}
          mergeWorkdir={selectedRepo}
          mergeSourceBranch={mergeWorktree?.branch || undefined}
          onResolveConflict={handleResolveConflict}
          onCompleteMerge={handleCompleteMerge}
          onAbortMerge={handleAbortMerge}
          getConflictContent={getConflictContent}
          showDraggableSettingsWindow={settingsDisplayMode === 'draggable-modal'}
          settingsWindowOpen={settingsDialogOpen}
          onSettingsWindowOpenChange={handleSettingsDialogOpenChange}
          settingsCategory={settingsCategory}
          onSettingsCategoryChange={handleSettingsCategoryChange}
          scrollToProvider={scrollToProvider}
        />

        {showStartupOverlay ? (
          <div className="absolute inset-0 z-50">
            <StartupShell
              title={startupOverlayTitle}
              description={startupOverlayDescription}
              progressLabel={startupOverlayProgressLabel}
              progressValue={startupProgress.currentStep}
              progressMax={startupProgress.totalSteps}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
