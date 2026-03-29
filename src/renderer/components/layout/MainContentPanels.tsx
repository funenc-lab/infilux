import { getDisplayPathBasename } from '@shared/utils/path';
import { GitBranch, RectangleEllipsis, Sparkles } from 'lucide-react';
import type { TabId } from '@/App/constants';
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
  onSwitchWorktree?: (worktreePath: string) => void;
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
  onTabChange: (tab: TabId) => void;
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
  onSwitchWorktree,
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
  onTabChange,
}: MainContentPanelsProps) {
  const { t } = useI18n();
  const repoLabel = getPathLabel(repoPath);

  return (
    <div className="relative flex-1 overflow-hidden">
      {shouldRenderCurrentChatPanel ? (
        <div
          className={cn(
            'absolute inset-0',
            innerBg,
            activeTab === 'chat' ? 'z-10' : 'invisible pointer-events-none z-0'
          )}
        >
          {retainedChatContext ? (
            <>
              <DeferredAgentPanel
                repoPath={retainedChatContext.repoPath}
                cwd={retainedChatContext.worktreePath}
                isActive={activeTab === 'chat' && hasActiveWorktree}
                onSwitchWorktree={onSwitchWorktree}
                shouldLoad
              />
              {!hasActiveWorktree ? (
                <div className={cn('absolute inset-0 z-20', innerBg)}>
                  <ConsoleIdleState
                    title={t('AI Agent needs a worktree')}
                    description={t(
                      'Each worktree keeps its own agent sessions, context, and output.'
                    )}
                    repoLabel={repoLabel}
                    worktreeCollapsed={worktreeCollapsed}
                    onExpandWorktree={onExpandWorktree}
                  />
                </div>
              ) : null}
            </>
          ) : (
            <div className={cn('h-full', innerBg)}>
              <ConsoleIdleState
                title={t('AI Agent needs a worktree')}
                description={t('Each worktree keeps its own agent sessions, context, and output.')}
                repoLabel={repoLabel}
                worktreeCollapsed={worktreeCollapsed}
                onExpandWorktree={onExpandWorktree}
              />
            </div>
          )}
        </div>
      ) : null}
      {cachedChatPanelPaths.map((cachedWorktreePath) => {
        const cachedRepoPath = getRepoPathForWorktree(cachedWorktreePath);
        if (!cachedRepoPath) {
          return null;
        }

        return (
          <div
            key={`chat:${cachedWorktreePath}`}
            className={cn('absolute inset-0', innerBg, 'invisible pointer-events-none z-0')}
          >
            <DeferredAgentPanel
              repoPath={cachedRepoPath}
              cwd={cachedWorktreePath}
              isActive={false}
              onSwitchWorktree={onSwitchWorktree}
              shouldLoad
            />
          </div>
        );
      })}

      {shouldRenderCurrentTerminalPanel ? (
        <div
          className={cn(
            'absolute inset-0',
            innerBg,
            activeTab === 'terminal' ? 'z-10' : 'invisible pointer-events-none z-0'
          )}
        >
          <DeferredTerminalPanel
            repoPath={currentRepoPath ?? undefined}
            cwd={currentWorktreePath ?? undefined}
            isActive={activeTab === 'terminal' && hasActiveWorktree}
            onExpandWorktree={onExpandWorktree}
            shouldLoad={activeTab === 'terminal'}
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
              rootPath={currentWorktreePath ?? undefined}
              isActive={activeTab === 'file'}
              onExpandWorktree={onExpandWorktree}
              shouldLoad={activeTab === 'file'}
              worktreeCollapsed={worktreeCollapsed}
            />
          ) : (
            <DeferredFilePanel
              rootPath={currentWorktreePath ?? undefined}
              isActive={activeTab === 'file'}
              onExpandWorktree={onExpandWorktree}
              shouldLoad={activeTab === 'file'}
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
            <DeferredCurrentFilePanel rootPath={cachedWorktreePath} isActive={false} shouldLoad />
          ) : (
            <DeferredFilePanel rootPath={cachedWorktreePath} isActive={false} shouldLoad />
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
                className="flex h-6 items-center gap-1 rounded px-2 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
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
      ) : null}
    </div>
  );
}
