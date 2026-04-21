import type { LiveAgentSubagent } from '@shared/types';
import { getDisplayPathBasename } from '@shared/utils/path';
import { GitBranch, RectangleEllipsis, Sparkles } from 'lucide-react';
import type { TabId } from '@/App/constants';
import type { StartupBlockingKey } from '@/App/startupOverlayPolicy';
import { normalizePath } from '@/App/storage';
import type { SettingsCategory } from '@/components/settings/constants';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { ControlStateActionButton } from './ControlStateActionButton';
import { ControlStateCard } from './ControlStateCard';
import { DeferredAgentPanel } from './DeferredAgentPanel';
import { DeferredCurrentFilePanel } from './DeferredCurrentFilePanel';
import { DeferredFilePanel } from './DeferredFilePanel';
import { DeferredSettingsContent } from './DeferredSettingsContent';
import { DeferredSourceControlPanel } from './DeferredSourceControlPanel';
import { DeferredTerminalPanel } from './DeferredTerminalPanel';
import { DeferredTodoPanel } from './DeferredTodoPanel';
import { resolveMainContentChatPanelPlan } from './mainContentChatPanelPlan';
import { SubagentTranscriptPanel } from './SubagentTranscriptPanel';

type FileTreeDisplayMode = 'legacy' | 'current';
type SettingsDisplayMode = 'tab' | 'draggable-modal';

interface RetainedChatContext {
  repoPath: string;
  worktreePath: string;
}

export interface MainContentPanelsProps {
  activeTab: TabId;
  innerBg: string;
  repoPath?: string;
  worktreePath?: string;
  currentRepoPath: string | null;
  currentWorktreePath: string | null;
  retainedChatContext: RetainedChatContext | null;
  hasActiveWorktree: boolean;
  worktreeCollapsed: boolean;
  onExpandWorktree?: () => void;
  getRepoPathForWorktree: (worktreePath: string) => string | null;
  shouldRenderCurrentChatPanel: boolean;
  shouldRenderCurrentTerminalPanel: boolean;
  shouldRenderCurrentFilePanel: boolean;
  cachedChatPanelPaths: string[];
  cachedTerminalPanelPaths: string[];
  cachedFilePanelPaths: string[];
  fileTreeDisplayMode: FileTreeDisplayMode;
  shouldRenderSourceControl: boolean;
  sourceControlRootPath?: string;
  sourceControlEmptyTitle?: string;
  sourceControlEmptyDescription?: string;
  todoEnabled: boolean;
  shouldRenderTodo: boolean;
  shouldRenderSettings: boolean;
  settingsDisplayMode: SettingsDisplayMode;
  setSettingsDisplayMode: (mode: SettingsDisplayMode) => void;
  settingsCategory?: SettingsCategory;
  onCategoryChange?: (category: SettingsCategory) => void;
  scrollToProvider?: boolean;
  chatCanvasRecenterToken?: number;
  chatCanvasRecenterWorktreePath?: string | null;
  chatCanvasFocusToken?: number;
  chatCanvasFocusWorktreePath?: string | null;
  chatCanvasFocusSessionId?: string | null;
  onTabChange: (tab: TabId) => void;
  selectedSubagent?: LiveAgentSubagent | null;
  onCloseSelectedSubagent?: () => void;
  onStartupBlockingReady?: (key: StartupBlockingKey) => void;
}

function getPathLabel(path?: string | null): string | null {
  if (!path) {
    return null;
  }

  return getDisplayPathBasename(path) || path;
}

function ConsoleIdleState({
  title,
  description,
  repoLabel,
  worktreeCollapsed = false,
  onExpandWorktree,
}: {
  title: string;
  description: string;
  repoLabel?: string | null;
  worktreeCollapsed?: boolean;
  onExpandWorktree?: (() => void) | undefined;
}) {
  const { t } = useI18n();
  const hasRepoContext = Boolean(repoLabel);
  const nextStep =
    onExpandWorktree && worktreeCollapsed
      ? t('Expand the worktree sidebar and choose a worktree')
      : hasRepoContext
        ? t('Choose a worktree in this repository')
        : t('Add or select a repository, then choose a worktree');

  return (
    <ControlStateCard
      icon={<Sparkles className="h-5 w-5" />}
      eyebrow={t('Agent Console')}
      title={title}
      description={description}
      metaLabel={t('Next Step')}
      metaValue={nextStep}
      actions={
        onExpandWorktree && worktreeCollapsed ? (
          <ControlStateActionButton onClick={onExpandWorktree}>
            <GitBranch className="mr-2 h-4 w-4" />
            {t('Choose Worktree')}
          </ControlStateActionButton>
        ) : null
      }
    />
  );
}

export function MainContentPanels({
  activeTab,
  innerBg,
  repoPath,
  worktreePath,
  currentRepoPath,
  currentWorktreePath,
  retainedChatContext,
  hasActiveWorktree,
  worktreeCollapsed,
  onExpandWorktree,
  getRepoPathForWorktree,
  shouldRenderCurrentChatPanel,
  shouldRenderCurrentTerminalPanel,
  shouldRenderCurrentFilePanel,
  cachedChatPanelPaths,
  cachedTerminalPanelPaths,
  cachedFilePanelPaths,
  fileTreeDisplayMode,
  shouldRenderSourceControl,
  sourceControlRootPath,
  sourceControlEmptyTitle,
  sourceControlEmptyDescription,
  todoEnabled,
  shouldRenderTodo,
  shouldRenderSettings,
  settingsDisplayMode,
  setSettingsDisplayMode,
  settingsCategory,
  onCategoryChange,
  scrollToProvider,
  chatCanvasRecenterToken = 0,
  chatCanvasRecenterWorktreePath = null,
  chatCanvasFocusToken = 0,
  chatCanvasFocusWorktreePath = null,
  chatCanvasFocusSessionId = null,
  onTabChange,
  selectedSubagent = null,
  onCloseSelectedSubagent,
  onStartupBlockingReady,
}: MainContentPanelsProps) {
  const { t } = useI18n();
  const repoLabel = getPathLabel(repoPath);
  const showSubagentTranscript =
    Boolean(selectedSubagent) && activeTab === 'chat' && hasActiveWorktree;
  const chatPanelEntries = resolveMainContentChatPanelPlan({
    activeTab,
    cachedChatPanelPaths,
    getRepoPathForWorktree,
    hasActiveWorktree,
    retainedChatContext,
    shouldRenderCurrentChatPanel,
    showSubagentTranscript,
  });

  return (
    <div className="relative flex-1 overflow-hidden">
      {chatPanelEntries.map((entry) => {
        const canvasRecenterOnActivateToken =
          entry.isCurrent &&
          chatCanvasRecenterToken > 0 &&
          chatCanvasRecenterWorktreePath &&
          normalizePath(entry.worktreePath) === normalizePath(chatCanvasRecenterWorktreePath)
            ? chatCanvasRecenterToken
            : 0;
        const canvasFocusOnActivateToken =
          entry.isCurrent &&
          chatCanvasFocusToken > 0 &&
          chatCanvasFocusWorktreePath &&
          normalizePath(entry.worktreePath) === normalizePath(chatCanvasFocusWorktreePath)
            ? chatCanvasFocusToken
            : 0;
        const canvasFocusSessionIdForEntry =
          canvasFocusOnActivateToken > 0 ? chatCanvasFocusSessionId : null;

        return (
          <div
            key={`chat:${entry.worktreePath}`}
            className={cn(
              'absolute inset-0',
              innerBg,
              entry.isVisible ? 'z-10' : 'invisible pointer-events-none z-0'
            )}
          >
            <DeferredAgentPanel
              onReady={
                entry.isCurrent && entry.isVisible
                  ? () => onStartupBlockingReady?.('chat-panel')
                  : undefined
              }
              repoPath={entry.repoPath}
              cwd={entry.worktreePath}
              isActive={entry.isActive}
              canvasRecenterOnActivateToken={canvasRecenterOnActivateToken}
              canvasFocusOnActivateToken={canvasFocusOnActivateToken}
              canvasFocusSessionId={canvasFocusSessionIdForEntry}
              shouldLoad
              showFallback={entry.showFallback}
            />
          </div>
        );
      })}
      {showSubagentTranscript ? (
        <div className={cn('absolute inset-0 z-20', innerBg)}>
          <SubagentTranscriptPanel
            subagent={selectedSubagent as LiveAgentSubagent}
            onClose={onCloseSelectedSubagent ?? (() => {})}
          />
        </div>
      ) : null}
      {shouldRenderCurrentChatPanel && retainedChatContext && !hasActiveWorktree ? (
        <div className={cn('absolute inset-0 z-20', innerBg)}>
          <ConsoleIdleState
            title={t('AI Agent needs a worktree')}
            description={t('Each worktree keeps its own agent sessions, context, and output.')}
            repoLabel={repoLabel}
            worktreeCollapsed={worktreeCollapsed}
            onExpandWorktree={onExpandWorktree}
          />
        </div>
      ) : null}
      {shouldRenderCurrentChatPanel && !retainedChatContext ? (
        <div
          className={cn(
            'absolute inset-0',
            innerBg,
            activeTab === 'chat' ? 'z-10' : 'invisible pointer-events-none z-0'
          )}
        >
          <ConsoleIdleState
            title={t('AI Agent needs a worktree')}
            description={t('Each worktree keeps its own agent sessions, context, and output.')}
            repoLabel={repoLabel}
            worktreeCollapsed={worktreeCollapsed}
            onExpandWorktree={onExpandWorktree}
          />
        </div>
      ) : null}

      {shouldRenderCurrentTerminalPanel ? (
        <div
          className={cn(
            'absolute inset-0',
            innerBg,
            activeTab === 'terminal' ? 'z-10' : 'invisible pointer-events-none z-0'
          )}
        >
          <DeferredTerminalPanel
            onReady={() => onStartupBlockingReady?.('terminal-panel')}
            repoPath={currentRepoPath ?? undefined}
            cwd={currentWorktreePath ?? undefined}
            isActive={activeTab === 'terminal' && hasActiveWorktree}
            onExpandWorktree={onExpandWorktree}
            shouldLoad={activeTab === 'terminal'}
            showFallback={activeTab === 'terminal'}
            worktreeCollapsed={worktreeCollapsed}
          />
        </div>
      ) : null}
      {cachedTerminalPanelPaths.map((cachedWorktreePath) => (
        <div
          key={`terminal:${cachedWorktreePath}`}
          className={cn('absolute inset-0', innerBg, 'invisible pointer-events-none z-0')}
        >
          <DeferredTerminalPanel
            repoPath={getRepoPathForWorktree(cachedWorktreePath) ?? undefined}
            cwd={cachedWorktreePath}
            isActive={false}
            shouldLoad
            showFallback={false}
          />
        </div>
      ))}

      {shouldRenderCurrentFilePanel ? (
        <div
          className={cn(
            'absolute inset-0',
            innerBg,
            activeTab === 'file' ? 'z-10' : 'invisible pointer-events-none z-0'
          )}
        >
          {fileTreeDisplayMode === 'current' ? (
            <DeferredCurrentFilePanel
              onReady={() => onStartupBlockingReady?.('file-panel')}
              rootPath={currentWorktreePath ?? undefined}
              isActive={activeTab === 'file'}
              onExpandWorktree={onExpandWorktree}
              shouldLoad={activeTab === 'file'}
              showFallback={activeTab === 'file'}
              worktreeCollapsed={worktreeCollapsed}
            />
          ) : (
            <DeferredFilePanel
              onReady={() => onStartupBlockingReady?.('file-panel')}
              rootPath={currentWorktreePath ?? undefined}
              isActive={activeTab === 'file'}
              treeEnabled={activeTab === 'file'}
              onExpandWorktree={onExpandWorktree}
              shouldLoad={activeTab === 'file'}
              showFallback={activeTab === 'file'}
              worktreeCollapsed={worktreeCollapsed}
            />
          )}
        </div>
      ) : null}
      {cachedFilePanelPaths.map((cachedWorktreePath) => (
        <div
          key={`${fileTreeDisplayMode}:${cachedWorktreePath}`}
          className={cn('absolute inset-0', innerBg, 'invisible pointer-events-none z-0')}
        >
          {fileTreeDisplayMode === 'current' ? (
            <DeferredCurrentFilePanel
              rootPath={cachedWorktreePath}
              isActive={false}
              shouldLoad
              showFallback={false}
            />
          ) : (
            <DeferredFilePanel
              rootPath={cachedWorktreePath}
              isActive={false}
              treeEnabled={false}
              shouldLoad
              showFallback={false}
            />
          )}
        </div>
      ))}
      {shouldRenderSourceControl ? (
        <div
          className={cn(
            'absolute inset-0',
            innerBg,
            activeTab === 'source-control' ? 'z-10' : 'invisible pointer-events-none z-0'
          )}
        >
          <DeferredSourceControlPanel
            onReady={() => onStartupBlockingReady?.('source-control-panel')}
            shouldLoad={shouldRenderSourceControl}
            rootPath={sourceControlRootPath}
            isActive={activeTab === 'source-control'}
            onExpandWorktree={onExpandWorktree}
            worktreeCollapsed={worktreeCollapsed}
            emptyTitle={sourceControlEmptyTitle}
            emptyDescription={sourceControlEmptyDescription}
          />
        </div>
      ) : null}

      {todoEnabled && shouldRenderTodo ? (
        <div
          className={cn(
            'absolute inset-0',
            innerBg,
            activeTab === 'todo' ? 'z-10' : 'invisible pointer-events-none z-0'
          )}
        >
          <DeferredTodoPanel
            onReady={() => onStartupBlockingReady?.('todo-panel')}
            shouldLoad={shouldRenderTodo}
            repoPath={repoPath}
            worktreePath={worktreePath}
            isActive={activeTab === 'todo'}
            onSwitchToAgent={() => onTabChange('chat')}
          />
        </div>
      ) : null}

      {settingsDisplayMode === 'tab' && shouldRenderSettings ? (
        <div
          className={cn(
            'absolute inset-0',
            innerBg,
            activeTab === 'settings' ? 'z-10' : 'invisible pointer-events-none z-0'
          )}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h1 className="ui-type-panel-title">{t('Settings')}</h1>
              <button
                type="button"
                onClick={() => setSettingsDisplayMode('draggable-modal')}
                className="control-topbar-action h-6 gap-1 rounded-md px-2 text-xs"
                title={t('Switch to floating mode')}
              >
                <RectangleEllipsis className="h-3.5 w-3.5" />
                {t('Switch to floating mode')}
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <DeferredSettingsContent
                onReady={() => onStartupBlockingReady?.('settings-panel')}
                shouldLoad={shouldRenderSettings}
                activeCategory={settingsCategory}
                onCategoryChange={onCategoryChange}
                scrollToProvider={scrollToProvider}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
