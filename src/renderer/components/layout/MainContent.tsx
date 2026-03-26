import { getDisplayPathBasename } from '@shared/utils/path';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronRight,
  FileCode,
  FolderOpen,
  GitBranch,
  KanbanSquare,
  MessageSquare,
  PanelLeft,
  RectangleEllipsis,
  Settings,
  Sparkles,
  Terminal,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_TAB_ORDER, type TabId } from '@/App/constants';
import { normalizePath } from '@/App/storage';
import { OpenInMenu } from '@/components/app/OpenInMenu';
import { RunningProjectsPopover } from '@/components/layout/RunningProjectsPopover';
import type { SettingsCategory } from '@/components/settings/constants';
import { Button } from '@/components/ui/button';
import { EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Menu, MenuItem, MenuPopup, MenuTrigger } from '@/components/ui/menu';
import { useI18n } from '@/i18n';
import { springFast } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { useSettingsStore } from '@/stores/settings';
import { useTerminalWriteStore } from '@/stores/terminalWrite';
import { useWorktreeActivityStore } from '@/stores/worktreeActivity';
import { DeferredAgentPanel } from './DeferredAgentPanel';
import { DeferredCurrentFilePanel } from './DeferredCurrentFilePanel';
import { DeferredDiffReviewModal } from './DeferredDiffReviewModal';
import { DeferredFilePanel } from './DeferredFilePanel';
import { DeferredSettingsContent } from './DeferredSettingsContent';
import { DeferredSourceControlPanel } from './DeferredSourceControlPanel';
import { DeferredTerminalPanel } from './DeferredTerminalPanel';
import { DeferredTodoPanel } from './DeferredTodoPanel';
import { shouldRenderTabPanel } from './mainContentMountPolicy';

type LayoutMode = 'columns' | 'tree';

function getPathLabel(path?: string | null): string {
  if (!path) {
    return 'Awaiting selection';
  }

  return getDisplayPathBasename(path) || path;
}

function getAgentLabel(agentId?: string | null): string {
  if (!agentId) {
    return 'No active agent';
  }

  return agentId
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function ConsoleIdleState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-full items-center justify-center p-6 md:p-8">
      <div className="w-full max-w-3xl">
        <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          AI Collaboration Console
        </div>
        <EmptyHeader className="mt-3 max-w-2xl items-start text-left">
          <EmptyTitle className="text-2xl font-semibold tracking-[-0.03em]">{title}</EmptyTitle>
          <EmptyDescription className="mt-3 max-w-xl text-sm leading-6">
            {description}
          </EmptyDescription>
        </EmptyHeader>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border/70 bg-background px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              Agent
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Start or resume a session after selecting the correct worktree.
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-background px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Terminal className="h-4 w-4 text-primary" />
              Runtime
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Keep terminal output close to the active task so interventions stay quick.
            </p>
          </div>
        </div>

        {action ? <div className="mt-6 flex items-center gap-3">{action}</div> : null}
      </div>
    </div>
  );
}

interface MainContentProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  tabOrder?: TabId[];
  onTabReorder?: (fromIndex: number, toIndex: number) => void;
  repoPath?: string; // repository path for session storage
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
}: MainContentProps) {
  const { t } = useI18n();
  const settingsDisplayMode = useSettingsStore((s) => s.settingsDisplayMode);
  const setSettingsDisplayMode = useSettingsStore((s) => s.setSettingsDisplayMode);
  const fileTreeDisplayMode = useSettingsStore((s) => s.fileTreeDisplayMode);
  const todoEnabled = useSettingsStore((s) => s.todoEnabled);
  const worktreeActivities = useWorktreeActivityStore((s) => s.activities);
  const worktreeActivityStates = useWorktreeActivityStore((s) => s.activityStates);

  // Diff Review Modal state
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  // Subscribe to sessions and activeIds for reactivity
  const sessions = useAgentSessionsStore((s) => s.sessions);
  const activeIds = useAgentSessionsStore((s) => s.activeIds);
  const runtimeStates = useAgentSessionsStore((s) => s.runtimeStates);
  const activeSessionId = useMemo(() => {
    if (!repoPath || !worktreePath) return null;
    const key = normalizePath(worktreePath);
    const activeId = activeIds[key];
    if (activeId) {
      const session = sessions.find((s) => s.id === activeId);
      if (session) return activeId;
    }
    const firstSession = sessions.find((s) => s.repoPath === repoPath && s.cwd === worktreePath);
    return firstSession?.id ?? null;
  }, [repoPath, worktreePath, sessions, activeIds]);

  // Sync activeSessionId to terminalWrite store for global access (e.g., toast "Send to Session")
  const setActiveSessionId = useTerminalWriteStore((s) => s.setActiveSessionId);
  useEffect(() => {
    setActiveSessionId(activeSessionId);
  }, [activeSessionId, setActiveSessionId]);

  // Tab metadata configuration (excludes 'settings' as it's not shown in the tab bar)
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

  // Generate tabs array based on tabOrder (filter out 'settings' tab and disabled features)
  const tabs = tabOrder
    .filter(
      (id): id is Exclude<TabId, 'settings'> => id !== 'settings' && (id !== 'todo' || todoEnabled)
    )
    .map(
      (id) =>
        ({ id, ...tabConfigMap[id] }) as {
          id: Exclude<TabId, 'settings'>;
          icon: React.ElementType;
          label: string;
        }
    );

  // Drag reorder state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const dragImageRef = useRef<HTMLDivElement | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

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

  const handleDragStart = useCallback((e: React.DragEvent, index: number, label: string) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));

    const dragImage = dragImageRef.current;
    if (dragImage) {
      dragImage.textContent = label;
      e.dataTransfer.setDragImage(dragImage, dragImage.offsetWidth / 2, dragImage.offsetHeight / 2);
    }
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
    setDropTargetIndex(null);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (draggedIndex !== null && draggedIndex !== index) {
        setDropTargetIndex((prev) => (prev === index ? prev : index));
      }
    },
    [draggedIndex]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) {
      return;
    }
    setDropTargetIndex(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault();
      const fromIndex = draggedIndex;
      if (fromIndex !== null && fromIndex !== toIndex && onTabReorder) {
        onTabReorder(fromIndex, toIndex);
      }
      setDropTargetIndex(null);
    },
    [onTabReorder, draggedIndex]
  );

  // Need extra padding for traffic lights when both panels are collapsed (macOS only)
  const isMac = window.electronAPI.env.platform === 'darwin';
  const needsTrafficLightPadding = isMac && repositoryCollapsed && worktreeCollapsed;

  // Remember the last valid repo/worktree pair to keep AgentPanel mounted
  // without mixing a new repoPath with an old worktreePath.
  const lastValidContextRef = useRef<{ repoPath: string; worktreePath: string } | null>(null);

  useEffect(() => {
    if (repoPath && worktreePath) {
      lastValidContextRef.current = { repoPath, worktreePath };
    }
  }, [repoPath, worktreePath]);

  const effectiveRepoPath =
    repoPath && worktreePath ? repoPath : (lastValidContextRef.current?.repoPath ?? null);
  const effectiveWorktreePath =
    repoPath && worktreePath ? worktreePath : (lastValidContextRef.current?.worktreePath ?? null);

  // Check if we have a currently selected worktree
  const hasActiveWorktree = Boolean(repoPath && worktreePath);
  const effectiveSourceControlRootPath = sourceControlRootPath ?? worktreePath;
  const effectiveReviewRootPath = reviewRootPath ?? worktreePath;
  const effectiveOpenInPath = openInPath ?? worktreePath;
  const shouldRenderSourceControl = shouldRenderTabPanel('source-control', activeTab);
  const shouldRenderTodo = shouldRenderTabPanel('todo', activeTab);
  const shouldRenderSettings = shouldRenderTabPanel('settings', activeTab);
  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions]
  );
  const worktreeSessions = useMemo(() => {
    if (!repoPath || !worktreePath) {
      return [];
    }

    return sessions.filter(
      (session) => session.repoPath === repoPath && session.cwd === worktreePath
    );
  }, [repoPath, sessions, worktreePath]);
  const unreadSessionsCount = useMemo(
    () =>
      worktreeSessions.reduce(
        (count, session) => count + (runtimeStates[session.id]?.outputState === 'unread' ? 1 : 0),
        0
      ),
    [runtimeStates, worktreeSessions]
  );
  const outputtingSessionsCount = useMemo(
    () =>
      worktreeSessions.reduce(
        (count, session) =>
          count + (runtimeStates[session.id]?.outputState === 'outputting' ? 1 : 0),
        0
      ),
    [runtimeStates, worktreeSessions]
  );
  const currentWorktreeActivity = (worktreePath && worktreeActivities[worktreePath]) || {
    agentCount: 0,
    terminalCount: 0,
  };
  const currentActivityState = (worktreePath && worktreeActivityStates[worktreePath]) || 'idle';
  const repoLabel = getPathLabel(repoPath);
  const worktreeLabel = getPathLabel(worktreePath);
  const activeAgentLabel = activeSession?.name || getAgentLabel(activeSession?.agentId);
  const liveStatus = useMemo(() => {
    if (currentActivityState === 'waiting_input') {
      return {
        chipClassName: 'control-chip-wait',
        label: 'Awaiting input',
      };
    }

    if (outputtingSessionsCount > 0 || currentActivityState === 'running') {
      return {
        chipClassName: 'control-chip-live',
        label: 'Live execution',
      };
    }

    if (unreadSessionsCount > 0 || currentActivityState === 'completed') {
      return {
        chipClassName: 'control-chip-done',
        label: 'Review ready',
      };
    }

    return {
      chipClassName: '',
      label: hasActiveWorktree ? 'Ready for command' : 'Idle console',
    };
  }, [currentActivityState, hasActiveWorktree, outputtingSessionsCount, unreadSessionsCount]);

  // When background image is enabled, avoid stacking multiple semi-transparent bg-background layers
  // Keep bg-background on <main> only (1 layer), remove from all inner elements to prevent double-stacking
  const bgImageEnabled = useSettingsStore((s) => s.backgroundImageEnabled);
  const innerBg = bgImageEnabled ? '' : 'bg-background';
  const hasCollapsedPanels = repositoryCollapsed || worktreeCollapsed || fileSidebarCollapsed;
  const showOpenInToolbar = showOpenInMenu && activeTab === 'file' && Boolean(effectiveOpenInPath);
  const headerButtonClass =
    'control-panel-muted flex h-8 items-center justify-center rounded-lg px-2.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground';

  return (
    <main className={cn('flex min-w-0 flex-1 flex-col overflow-hidden bg-background')}>
      <header
        className={cn(
          'shrink-0 border-b px-4 py-2.5 drag-region',
          innerBg,
          needsTrafficLightPadding && 'pl-[80px]'
        )}
      >
        <div className="flex items-center justify-between gap-3 no-drag">
          <div className="flex min-w-0 items-center gap-2">
            <AnimatePresence mode="popLayout">
              {hasCollapsedPanels && (
                <motion.div
                  key="toolbar-panels"
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 'auto', opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  className="flex items-center gap-2 overflow-hidden"
                >
                  {repositoryCollapsed && onSwitchWorktree && onSwitchTab && (
                    <RunningProjectsPopover
                      onSelectWorktreeByPath={onSwitchWorktree}
                      onSwitchTab={onSwitchTab}
                      showBadge={false}
                    />
                  )}
                  <Menu>
                    <MenuTrigger
                      render={
                        <button type="button" className={headerButtonClass} title={t('Panels')}>
                          <PanelLeft className="h-4 w-4" />
                        </button>
                      }
                    />
                    <MenuPopup align="start" sideOffset={8} className="min-w-[190px]">
                      {layoutMode === 'tree' ? (
                        onExpandRepository ? (
                          <MenuItem onClick={onExpandRepository}>
                            <FolderOpen className="h-4 w-4" />
                            {t('Expand Sidebar')}
                          </MenuItem>
                        ) : null
                      ) : (
                        <>
                          {repositoryCollapsed && onExpandRepository ? (
                            <MenuItem onClick={onExpandRepository}>
                              <FolderOpen className="h-4 w-4" />
                              {t('Expand Repository')}
                            </MenuItem>
                          ) : null}
                          {worktreeCollapsed && onExpandWorktree ? (
                            <MenuItem onClick={onExpandWorktree}>
                              <GitBranch className="h-4 w-4" />
                              {t('Expand Worktree')}
                            </MenuItem>
                          ) : null}
                        </>
                      )}
                      {fileSidebarCollapsed && onExpandFileSidebar ? (
                        <MenuItem onClick={onExpandFileSidebar}>
                          <PanelLeft className="h-4 w-4" />
                          {t('Expand File Sidebar')}
                        </MenuItem>
                      ) : null}
                    </MenuPopup>
                  </Menu>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex min-w-0 items-center gap-0.5 rounded-lg border border-border/70 bg-muted/15 p-0.5">
              {tabs.map((tab, index) => {
                const isDropTarget = dropTargetIndex === index;
                const isDragging = draggedIndex === index;
                const isActive = activeTab === tab.id;
                return (
                  <div
                    key={tab.id}
                    draggable={!!onTabReorder}
                    onDragStart={
                      onTabReorder ? (e) => handleDragStart(e, index, tab.label) : undefined
                    }
                    onDragEnd={onTabReorder ? handleDragEnd : undefined}
                    onDragOver={onTabReorder ? (e) => handleDragOver(e, index) : undefined}
                    onDragLeave={onTabReorder ? handleDragLeave : undefined}
                    onDrop={onTabReorder ? (e) => handleDrop(e, index) : undefined}
                    aria-grabbed={isDragging}
                    aria-disabled={!onTabReorder}
                    className={cn(
                      'relative flex items-center',
                      isDragging && 'opacity-50',
                      onTabReorder && 'cursor-grab active:cursor-grabbing'
                    )}
                  >
                    {isDropTarget && !isDragging && (
                      <motion.div
                        layoutId="tab-drop-indicator"
                        className="absolute inset-x-2 -top-1 h-0.5 rounded-full bg-primary"
                        transition={springFast}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (tab.id === 'file' && fileSidebarCollapsed) {
                          onExpandFileSidebar?.();
                        }
                        onTabChange(tab.id);
                      }}
                      className={cn(
                        'relative flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] transition-colors',
                        isActive
                          ? 'text-foreground'
                          : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                      )}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="main-tab-highlight"
                          className="absolute inset-0 rounded-md border border-border/80 bg-background"
                          transition={springFast}
                        />
                      )}
                      <tab.icon className="relative z-10 h-4 w-4" />
                      <span className="relative z-10">{tab.label}</span>
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="hidden min-w-0 items-center gap-1.5 lg:flex">
              <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
                <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate font-medium text-foreground">{repoLabel}</span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                <GitBranch className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{worktreeLabel}</span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{activeAgentLabel}</span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <span className={cn('control-chip', liveStatus.chipClassName)}>{liveStatus.label}</span>
            {worktreeSessions.length > 0 && (
              <span className="control-chip">
                <Sparkles className="h-3 w-3" />
                {worktreeSessions.length}
              </span>
            )}
            {currentWorktreeActivity.terminalCount > 0 && (
              <span className="control-chip">
                <Terminal className="h-3 w-3" />
                {currentWorktreeActivity.terminalCount}
              </span>
            )}
            {unreadSessionsCount > 0 && (
              <span className="control-chip control-chip-done">{unreadSessionsCount} unread</span>
            )}
            <button
              type="button"
              className={cn(
                headerButtonClass,
                'w-8 px-0',
                isSettingsActive && 'control-chip-strong text-foreground'
              )}
              onClick={onToggleSettings}
              title={t('Settings')}
            >
              <Settings className="h-4 w-4" />
            </button>
            {activeSessionId && effectiveReviewRootPath && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsReviewModalOpen(true)}
                className="control-panel-muted h-8 rounded-lg border-0 px-3 text-[13px]"
              >
                <MessageSquare className="mr-1.5 h-4 w-4" />
                {t('Review')}
              </Button>
            )}
            {showOpenInToolbar ? (
              <OpenInMenu path={effectiveOpenInPath} activeTab={activeTab} />
            ) : null}
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="relative flex-1 overflow-hidden">
        {/* Chat tab - ALWAYS keep AgentPanel mounted to preserve terminal sessions across repo switches */}
        <div
          className={cn(
            'absolute inset-0',
            innerBg,
            activeTab === 'chat' ? 'z-10' : 'invisible pointer-events-none z-0'
          )}
        >
          {/* Always render AgentPanel if we have any valid paths (current or previous) */}
          {effectiveRepoPath && effectiveWorktreePath ? (
            <>
              <DeferredAgentPanel
                repoPath={effectiveRepoPath}
                cwd={effectiveWorktreePath}
                isActive={activeTab === 'chat' && hasActiveWorktree}
                onSwitchWorktree={onSwitchWorktree}
                shouldLoad
              />
              {/* Show overlay when no worktree is actively selected */}
              {!hasActiveWorktree && (
                <div
                  className={cn('absolute inset-0 z-20 flex items-center justify-center', innerBg)}
                >
                  <ConsoleIdleState
                    title={t('Select a Worktree')}
                    description={t('Choose a worktree to continue using AI Agent')}
                    action={
                      onExpandWorktree && worktreeCollapsed ? (
                        <Button
                          onClick={onExpandWorktree}
                          variant="outline"
                          className="control-panel-muted rounded-xl border-0"
                        >
                          <GitBranch className="mr-2 h-4 w-4" />
                          {t('Choose Worktree')}
                        </Button>
                      ) : null
                    }
                  />
                </div>
              )}
            </>
          ) : (
            <div className={cn('h-full flex items-center justify-center', innerBg)}>
              <ConsoleIdleState
                title={t('Start using AI Agent')}
                description={t('Select a Worktree to start using AI coding assistant')}
                action={
                  onExpandWorktree && worktreeCollapsed ? (
                    <Button
                      onClick={onExpandWorktree}
                      variant="outline"
                      className="control-panel-muted rounded-xl border-0"
                    >
                      <GitBranch className="mr-2 h-4 w-4" />
                      {t('Choose Worktree')}
                    </Button>
                  ) : null
                }
              />
            </div>
          )}
        </div>
        {/* Terminal tab - keep mounted to preserve shell sessions */}
        <div
          className={cn(
            'absolute inset-0',
            innerBg,
            activeTab === 'terminal' ? 'z-10' : 'invisible pointer-events-none z-0'
          )}
        >
          <DeferredTerminalPanel
            repoPath={effectiveRepoPath ?? undefined}
            cwd={effectiveWorktreePath ?? undefined}
            isActive={activeTab === 'terminal' && hasActiveWorktree}
            shouldLoad={activeTab === 'terminal'}
          />
        </div>
        {/* File tab - keep mounted to preserve editor state */}
        <div
          className={cn(
            'absolute inset-0',
            innerBg,
            activeTab === 'file' ? 'z-10' : 'invisible pointer-events-none z-0'
          )}
        >
          {fileTreeDisplayMode === 'current' ? (
            <DeferredCurrentFilePanel
              rootPath={worktreePath}
              isActive={activeTab === 'file'}
              shouldLoad={activeTab === 'file'}
            />
          ) : (
            <DeferredFilePanel
              rootPath={worktreePath}
              isActive={activeTab === 'file'}
              shouldLoad={activeTab === 'file'}
            />
          )}
        </div>
        {shouldRenderSourceControl && (
          <div
            className={cn(
              'absolute inset-0',
              innerBg,
              activeTab === 'source-control' ? 'z-10' : 'invisible pointer-events-none z-0'
            )}
          >
            <DeferredSourceControlPanel
              shouldLoad={shouldRenderSourceControl}
              rootPath={effectiveSourceControlRootPath}
              isActive={activeTab === 'source-control'}
              onExpandWorktree={onExpandWorktree}
              worktreeCollapsed={worktreeCollapsed}
              emptyTitle={sourceControlEmptyTitle}
              emptyDescription={sourceControlEmptyDescription}
            />
          </div>
        )}
        {/* Todo tab */}
        {todoEnabled && shouldRenderTodo && (
          <div
            className={cn(
              'absolute inset-0',
              innerBg,
              activeTab === 'todo' ? 'z-10' : 'invisible pointer-events-none z-0'
            )}
          >
            <DeferredTodoPanel
              shouldLoad={shouldRenderTodo}
              repoPath={repoPath}
              worktreePath={worktreePath}
              isActive={activeTab === 'todo'}
              onSwitchToAgent={() => onTabChange('chat')}
            />
          </div>
        )}
        {/* Settings tab */}
        {settingsDisplayMode === 'tab' && shouldRenderSettings && (
          <div
            className={cn(
              'absolute inset-0',
              innerBg,
              activeTab === 'settings' ? 'z-10' : 'invisible pointer-events-none z-0'
            )}
          >
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h1 className="text-lg font-medium">{t('Settings')}</h1>
                <button
                  type="button"
                  onClick={() => setSettingsDisplayMode('draggable-modal')}
                  className="flex h-6 items-center gap-1 rounded px-2 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
                  title={t('Switch to floating mode')}
                >
                  <RectangleEllipsis className="h-3.5 w-3.5" />
                  {t('Switch to floating mode')}
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <DeferredSettingsContent
                  shouldLoad={shouldRenderSettings}
                  activeCategory={settingsCategory}
                  onCategoryChange={onCategoryChange}
                  scrollToProvider={scrollToProvider}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Diff Review Modal */}
      <DeferredDiffReviewModal
        shouldLoad={isReviewModalOpen}
        open={isReviewModalOpen}
        onOpenChange={setIsReviewModalOpen}
        rootPath={effectiveReviewRootPath}
        onSend={() => onTabChange('chat')}
      />
    </main>
  );
}
