import type { LiveAgentSubagent } from '@shared/types';
import { FileCode, GitBranch, KanbanSquare, Sparkles, Terminal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_TAB_ORDER, type TabId } from '@/App/constants';
import type { StartupBlockingKey } from '@/App/startupOverlayPolicy';
import { normalizePath, pathsEqual } from '@/App/storage';
import type { SettingsCategory } from '@/components/settings/constants';
import { useI18n } from '@/i18n';
import { getRendererPlatform } from '@/lib/electronEnvironment';
import { cn } from '@/lib/utils';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { useEditorStore } from '@/stores/editor';
import { useSettingsStore } from '@/stores/settings';
import { toChatPanelInactivityThresholdMs } from '@/stores/settings/chatPanelInactivityThresholdPolicy';
import { useTerminalWriteStore } from '@/stores/terminalWrite';
import { useWorktreeActivityStore } from '@/stores/worktreeActivity';
import { updateRetainedActivityPanelPaths } from './activityPanelLruPolicy';
import { updateRetainedChatPanelPaths } from './chatPanelRetentionPolicy';
import { DeferredDiffReviewModal } from './DeferredDiffReviewModal';
import { updateRetainedFilePanelPaths } from './filePanelLruPolicy';
import { getFileTabCountForWorktree as getFileTabCountForWorktreeState } from './filePanelWorktreeState';
import { MainContentPanels } from './MainContentPanels';
import { MainContentTopbar } from './MainContentTopbar';
import { resolveMainContentContext } from './mainContentContextPolicy';
import { shouldRenderTabPanel } from './mainContentMountPolicy';
import { buildMainContentRenderPlan } from './mainContentRenderPlan';
import { resolveChatPanelRetentionState } from './panelRetentionPolicy';

type LayoutMode = 'columns' | 'tree';

export interface MainContentProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  tabOrder?: TabId[];
  onTabReorder?: (fromIndex: number, toIndex: number) => void;
  repoPath?: string;
  worktreePath?: string;
  sourceControlRootPath?: string;
  reviewRootPath?: string;
  openInPath?: string;
  repositoryCollapsed?: boolean;
  worktreeCollapsed?: boolean;
  fileSidebarCollapsed?: boolean;
  layoutMode?: LayoutMode;
  onExpandRepository?: () => void;
  onExpandWorktree?: () => void;
  onExpandFileSidebar?: () => void;
  onSwitchWorktree?: (worktreePath: string) => void;
  onSwitchTab?: (tab: TabId) => void;
  isSettingsActive?: boolean;
  settingsCategory?: SettingsCategory;
  onCategoryChange?: (category: SettingsCategory) => void;
  scrollToProvider?: boolean;
  onToggleSettings?: () => void;
  showOpenInMenu?: boolean;
  sourceControlEmptyTitle?: string;
  sourceControlEmptyDescription?: string;
  selectedSubagent?: LiveAgentSubagent | null;
  onCloseSelectedSubagent?: () => void;
  onStartupBlockingReady?: (key: StartupBlockingKey) => void;
}

function getValueForWorktreePath<T>(values: Record<string, T>, targetWorktreePath: string) {
  const directValue = values[targetWorktreePath];
  if (directValue !== undefined) {
    return directValue;
  }

  return Object.entries(values).find(([worktreePath]) =>
    pathsEqual(worktreePath, targetWorktreePath)
  )?.[1];
}

export function MainContent({
  activeTab,
  onTabChange,
  tabOrder = DEFAULT_TAB_ORDER,
  onTabReorder,
  repoPath,
  worktreePath,
  sourceControlRootPath,
  reviewRootPath,
  openInPath,
  repositoryCollapsed = false,
  worktreeCollapsed = false,
  fileSidebarCollapsed = false,
  layoutMode = 'columns',
  onExpandRepository,
  onExpandWorktree,
  onExpandFileSidebar,
  onSwitchWorktree,
  onSwitchTab,
  isSettingsActive = false,
  settingsCategory,
  onCategoryChange,
  scrollToProvider,
  onToggleSettings,
  showOpenInMenu = true,
  sourceControlEmptyTitle,
  sourceControlEmptyDescription,
  selectedSubagent = null,
  onCloseSelectedSubagent,
  onStartupBlockingReady,
}: MainContentProps) {
  const { t } = useI18n();
  const settingsDisplayMode = useSettingsStore((state) => state.settingsDisplayMode);
  const setSettingsDisplayMode = useSettingsStore((state) => state.setSettingsDisplayMode);
  const fileTreeDisplayMode = useSettingsStore((state) => state.fileTreeDisplayMode);
  const chatPanelInactivityThresholdMinutes = useSettingsStore(
    (state) => state.chatPanelInactivityThresholdMinutes
  );
  const todoEnabled = useSettingsStore((state) => state.todoEnabled);
  const bgImageEnabled = useSettingsStore((state) => state.backgroundImageEnabled);
  const editorTabCount = useEditorStore((state) => state.tabs.length);
  const editorCurrentWorktreePath = useEditorStore((state) => state.currentWorktreePath);
  const editorWorktreeStates = useEditorStore((state) => state.worktreeStates);
  const worktreeActivities = useWorktreeActivityStore((state) => state.activities);
  const worktreeActivityStates = useWorktreeActivityStore((state) => state.activityStates);

  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  const sessions = useAgentSessionsStore((state) => state.sessions);
  const activeIds = useAgentSessionsStore((state) => state.activeIds);
  const sessionRuntimeStates = useAgentSessionsStore((state) => state.runtimeStates);
  const activeSessionId = useMemo(() => {
    if (!repoPath || !worktreePath) {
      return null;
    }

    const key = normalizePath(worktreePath);
    const activeId = activeIds[key];
    if (activeId) {
      const session = sessions.find((candidate) => candidate.id === activeId);
      if (session) {
        return activeId;
      }
    }

    const firstSession = sessions.find(
      (candidate) => candidate.repoPath === repoPath && pathsEqual(candidate.cwd, worktreePath)
    );
    return firstSession?.id ?? null;
  }, [activeIds, repoPath, sessions, worktreePath]);

  const setActiveSessionId = useTerminalWriteStore((state) => state.setActiveSessionId);
  useEffect(() => {
    setActiveSessionId(activeSessionId);
  }, [activeSessionId, setActiveSessionId]);

  const tabConfigMap: Record<
    Exclude<TabId, 'settings'>,
    { icon: React.ElementType; label: string }
  > = {
    chat: { icon: Sparkles, label: t('Agent') },
    file: { icon: FileCode, label: t('File') },
    terminal: { icon: Terminal, label: t('Terminal') },
    'source-control': { icon: GitBranch, label: t('Version Control') },
    todo: { icon: KanbanSquare, label: t('Todo') },
  };

  const tabs = tabOrder
    .filter(
      (id): id is Exclude<TabId, 'settings'> => id !== 'settings' && (id !== 'todo' || todoEnabled)
    )
    .map((id) => ({
      id,
      ...tabConfigMap[id],
    }));

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const dragImageRef = useRef<HTMLDivElement | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [retainedChatPanelPaths, setRetainedChatPanelPaths] = useState<string[]>([]);
  const [retainedTerminalPanelPaths, setRetainedTerminalPanelPaths] = useState<string[]>([]);
  const [retainedFilePanelPaths, setRetainedFilePanelPaths] = useState<string[]>([]);

  useEffect(() => {
    const dragImage = document.createElement('div');
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

    return () => {
      dragImage.remove();
      dragImageRef.current = null;
    };
  }, []);

  const handleDragStart = useCallback((event: React.DragEvent, index: number, label: string) => {
    setDraggedIndex(index);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));

    const dragImage = dragImageRef.current;
    if (dragImage) {
      dragImage.textContent = label;
      event.dataTransfer.setDragImage(
        dragImage,
        dragImage.offsetWidth / 2,
        dragImage.offsetHeight / 2
      );
    }
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
    setDropTargetIndex(null);
  }, []);

  const handleDragOver = useCallback(
    (event: React.DragEvent, index: number) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (draggedIndex !== null && draggedIndex !== index) {
        setDropTargetIndex((previousIndex) => (previousIndex === index ? previousIndex : index));
      }
    },
    [draggedIndex]
  );

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    const related = event.relatedTarget as Node | null;
    if (related && event.currentTarget.contains(related)) {
      return;
    }
    setDropTargetIndex(null);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent, toIndex: number) => {
      event.preventDefault();
      const fromIndex = draggedIndex;
      if (fromIndex !== null && fromIndex !== toIndex && onTabReorder) {
        onTabReorder(fromIndex, toIndex);
      }
      setDropTargetIndex(null);
    },
    [draggedIndex, onTabReorder]
  );

  const isMac = getRendererPlatform() === 'darwin';
  const needsTrafficLightPadding = isMac && repositoryCollapsed && worktreeCollapsed;

  const lastValidContextRef = useRef<{ repoPath: string; worktreePath: string } | null>(null);
  useEffect(() => {
    if (repoPath && worktreePath) {
      lastValidContextRef.current = { repoPath, worktreePath };
    }
  }, [repoPath, worktreePath]);

  const {
    hasActiveWorktree,
    currentRepoPath,
    currentWorktreePath,
    currentNormalizedWorktreePath,
    retainedChatContext,
    sourceControlRootPath: effectiveSourceControlRootPath,
    reviewRootPath: effectiveReviewRootPath,
    openInPath: effectiveOpenInPath,
  } = resolveMainContentContext({
    repoPath,
    worktreePath,
    sourceControlRootPath,
    reviewRootPath,
    openInPath,
    lastValidContext: lastValidContextRef.current,
  });

  const getRepoPathForWorktree = useCallback(
    (targetWorktreePath: string) => {
      const matchingSession = sessions.find((session) =>
        pathsEqual(session.cwd, targetWorktreePath)
      );
      if (matchingSession) {
        return matchingSession.repoPath;
      }

      if (
        repoPath &&
        worktreePath &&
        normalizePath(targetWorktreePath) === normalizePath(worktreePath)
      ) {
        return repoPath;
      }

      if (
        retainedChatContext &&
        normalizePath(targetWorktreePath) === normalizePath(retainedChatContext.worktreePath)
      ) {
        return retainedChatContext.repoPath;
      }

      return null;
    },
    [repoPath, retainedChatContext, sessions, worktreePath]
  );

  const getChatRetentionStateForWorktree = useCallback(
    (targetWorktreePath: string) => {
      const matchingSessions = sessions.filter(
        (session) => pathsEqual(session.cwd, targetWorktreePath) && session.initialized
      );
      const activity = getValueForWorktreePath(worktreeActivities, targetWorktreePath);
      const activityState = getValueForWorktreePath(worktreeActivityStates, targetWorktreePath);
      const latestActivityAt = matchingSessions.reduce<number | null>(
        (latestTimestamp, session) => {
          const nextTimestamp = sessionRuntimeStates[session.id]?.lastActivityAt;
          if (typeof nextTimestamp !== 'number') {
            return latestTimestamp;
          }
          if (latestTimestamp === null || nextTimestamp > latestTimestamp) {
            return nextTimestamp;
          }
          return latestTimestamp;
        },
        null
      );
      const hasAttentionSignal =
        activityState === 'waiting_input' ||
        matchingSessions.some((session) => {
          const runtimeState = sessionRuntimeStates[session.id];
          return (
            runtimeState?.outputState === 'unread' || runtimeState?.hasCompletedTaskUnread === true
          );
        });
      const hasLiveActivity =
        activityState === 'running' ||
        (activity?.agentCount ?? 0) > 0 ||
        matchingSessions.some(
          (session) => sessionRuntimeStates[session.id]?.outputState === 'outputting'
        );

      return resolveChatPanelRetentionState({
        sessionCount: matchingSessions.length,
        latestActivityAt,
        hasAttentionSignal,
        hasLiveActivity,
        inactivityThresholdMs: toChatPanelInactivityThresholdMs(
          chatPanelInactivityThresholdMinutes
        ),
      });
    },
    [
      chatPanelInactivityThresholdMinutes,
      sessionRuntimeStates,
      sessions,
      worktreeActivities,
      worktreeActivityStates,
    ]
  );

  const hasTerminalActivityForWorktree = useCallback(
    (targetWorktreePath: string) => {
      const activity = getValueForWorktreePath(worktreeActivities, targetWorktreePath);
      return (activity?.terminalCount ?? 0) > 0;
    },
    [worktreeActivities]
  );

  const getFileTabCountForWorktree = useCallback(
    (targetWorktreePath: string) => {
      return getFileTabCountForWorktreeState({
        targetWorktreePath,
        currentWorktreePath: editorCurrentWorktreePath,
        currentTabCount: editorTabCount,
        worktreeStates: editorWorktreeStates,
      });
    },
    [editorCurrentWorktreePath, editorTabCount, editorWorktreeStates]
  );

  const effectiveFileTabCount = useMemo(() => {
    if (!currentNormalizedWorktreePath) {
      return 0;
    }

    return getFileTabCountForWorktree(currentNormalizedWorktreePath);
  }, [currentNormalizedWorktreePath, getFileTabCountForWorktree]);

  const currentChatRetentionState = currentWorktreePath
    ? getChatRetentionStateForWorktree(currentWorktreePath)
    : 'cold';
  const hasCurrentTerminalActivity = currentWorktreePath
    ? hasTerminalActivityForWorktree(currentWorktreePath)
    : false;

  const {
    shouldRenderCurrentChatPanel,
    shouldRenderCurrentTerminalPanel,
    shouldRenderCurrentFilePanel,
    cachedChatPanelPaths,
    cachedTerminalPanelPaths,
    cachedFilePanelPaths,
  } = useMemo(
    () =>
      buildMainContentRenderPlan({
        activeTab,
        effectiveWorktreePath: currentWorktreePath,
        retainedChatPanelPaths,
        retainedTerminalPanelPaths,
        retainedFilePanelPaths,
        currentChatRetentionState,
        hasCurrentTerminalActivity,
        currentFileTabCount: effectiveFileTabCount,
      }),
    [
      activeTab,
      currentWorktreePath,
      retainedChatPanelPaths,
      retainedTerminalPanelPaths,
      retainedFilePanelPaths,
      currentChatRetentionState,
      hasCurrentTerminalActivity,
      effectiveFileTabCount,
    ]
  );

  const shouldRenderSourceControl = shouldRenderTabPanel('source-control', activeTab);
  const shouldRenderTodo = shouldRenderTabPanel('todo', activeTab);
  const shouldRenderSettings = shouldRenderTabPanel('settings', activeTab);

  useEffect(() => {
    setRetainedChatPanelPaths((previousPaths) =>
      updateRetainedChatPanelPaths({
        previousPaths,
        activePath: currentWorktreePath,
        hasActivity: (worktreePath) => getChatRetentionStateForWorktree(worktreePath) !== 'cold',
      })
    );
  }, [currentWorktreePath, getChatRetentionStateForWorktree]);

  useEffect(() => {
    setRetainedTerminalPanelPaths((previousPaths) =>
      updateRetainedActivityPanelPaths({
        previousPaths,
        activePath: currentWorktreePath,
        hasActivity: hasTerminalActivityForWorktree,
      })
    );
  }, [currentWorktreePath, hasTerminalActivityForWorktree]);

  useEffect(() => {
    setRetainedFilePanelPaths((previousPaths) =>
      updateRetainedFilePanelPaths({
        previousPaths,
        activePath: currentWorktreePath,
        getTabCount: getFileTabCountForWorktree,
      })
    );
  }, [currentWorktreePath, getFileTabCountForWorktree]);

  const innerBg = bgImageEnabled ? '' : 'bg-background';
  const hasCollapsedPanels = repositoryCollapsed || worktreeCollapsed || fileSidebarCollapsed;
  const showOpenInToolbar = showOpenInMenu && activeTab === 'file' && Boolean(effectiveOpenInPath);

  return (
    <main className={cn('flex min-w-0 flex-1 flex-col overflow-hidden bg-background')}>
      <MainContentTopbar
        bgImageEnabled={bgImageEnabled}
        needsTrafficLightPadding={needsTrafficLightPadding}
        hasCollapsedPanels={hasCollapsedPanels}
        repositoryCollapsed={repositoryCollapsed}
        worktreeCollapsed={worktreeCollapsed}
        fileSidebarCollapsed={fileSidebarCollapsed}
        layoutMode={layoutMode}
        onExpandRepository={onExpandRepository}
        onExpandWorktree={onExpandWorktree}
        onExpandFileSidebar={onExpandFileSidebar}
        onSwitchWorktree={onSwitchWorktree}
        onSwitchTab={onSwitchTab}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={onTabChange}
        onTabReorder={onTabReorder}
        draggedIndex={draggedIndex}
        dropTargetIndex={dropTargetIndex}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        isSettingsActive={isSettingsActive}
        onToggleSettings={onToggleSettings}
        activeSessionId={activeSessionId}
        reviewRootPath={effectiveReviewRootPath ?? undefined}
        onOpenReview={() => setIsReviewModalOpen(true)}
        showOpenInToolbar={showOpenInToolbar}
        openInPath={effectiveOpenInPath ?? undefined}
      />

      <MainContentPanels
        activeTab={activeTab}
        innerBg={innerBg}
        repoPath={repoPath}
        worktreePath={worktreePath}
        currentRepoPath={currentRepoPath}
        currentWorktreePath={currentWorktreePath}
        retainedChatContext={retainedChatContext}
        hasActiveWorktree={hasActiveWorktree}
        worktreeCollapsed={worktreeCollapsed}
        onExpandWorktree={onExpandWorktree}
        onSwitchWorktree={onSwitchWorktree}
        getRepoPathForWorktree={getRepoPathForWorktree}
        shouldRenderCurrentChatPanel={shouldRenderCurrentChatPanel}
        shouldRenderCurrentTerminalPanel={shouldRenderCurrentTerminalPanel}
        shouldRenderCurrentFilePanel={shouldRenderCurrentFilePanel}
        cachedChatPanelPaths={cachedChatPanelPaths}
        cachedTerminalPanelPaths={cachedTerminalPanelPaths}
        cachedFilePanelPaths={cachedFilePanelPaths}
        fileTreeDisplayMode={fileTreeDisplayMode}
        shouldRenderSourceControl={shouldRenderSourceControl}
        sourceControlRootPath={effectiveSourceControlRootPath ?? undefined}
        sourceControlEmptyTitle={sourceControlEmptyTitle}
        sourceControlEmptyDescription={sourceControlEmptyDescription}
        todoEnabled={todoEnabled}
        shouldRenderTodo={shouldRenderTodo}
        shouldRenderSettings={shouldRenderSettings}
        settingsDisplayMode={settingsDisplayMode}
        setSettingsDisplayMode={setSettingsDisplayMode}
        settingsCategory={settingsCategory}
        onCategoryChange={onCategoryChange}
        scrollToProvider={scrollToProvider}
        onTabChange={onTabChange}
        selectedSubagent={selectedSubagent}
        onCloseSelectedSubagent={onCloseSelectedSubagent}
        onStartupBlockingReady={onStartupBlockingReady}
      />

      <DeferredDiffReviewModal
        shouldLoad={isReviewModalOpen}
        open={isReviewModalOpen}
        onOpenChange={setIsReviewModalOpen}
        rootPath={effectiveReviewRootPath ?? undefined}
        onSend={() => onTabChange('chat')}
      />
    </main>
  );
}
