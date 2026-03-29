import type { MergeConflictContent, WorktreeMergeResult } from '@shared/types';
import { type ComponentProps, lazy, Suspense } from 'react';
import { UnsavedPromptHost } from '../components/files/UnsavedPromptHost';
import { AddRepositoryDialog } from '../components/git/AddRepositoryDialog';
import { CloneProgressFloat } from '../components/git/CloneProgressFloat';
import { ActionPanel } from '../components/layout/ActionPanel';
import { RemoteAuthPromptHost } from '../components/remote/RemoteAuthPromptHost';
import { DraggableSettingsWindow } from '../components/settings/DraggableSettingsWindow';
import { TempWorkspaceDialogs } from '../components/temp-workspace/TempWorkspaceDialogs';
import { UpdateNotification } from '../components/UpdateNotification';
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from '../components/ui/dialog';
import { MergeWorktreeDialog } from '../components/worktree/MergeWorktreeDialog';
import { useI18n } from '../i18n';

const LazyMergeEditor = lazy(async () => {
  const module = await import('../components/worktree/MergeEditor');
  return { default: module.MergeEditor };
});

interface AppOverlaysProps {
  onConfirmTempWorkspaceDelete: ComponentProps<typeof TempWorkspaceDialogs>['onConfirmDelete'];
  onConfirmTempWorkspaceRename: ComponentProps<typeof TempWorkspaceDialogs>['onConfirmRename'];
  addRepositoryOpen: boolean;
  onAddRepositoryOpenChange: ComponentProps<typeof AddRepositoryDialog>['onOpenChange'];
  addRepositoryGroups: ComponentProps<typeof AddRepositoryDialog>['groups'];
  addRepositoryDefaultGroupId: ComponentProps<typeof AddRepositoryDialog>['defaultGroupId'];
  onAddLocalRepository: ComponentProps<typeof AddRepositoryDialog>['onAddLocal'];
  onCloneRepository: ComponentProps<typeof AddRepositoryDialog>['onCloneComplete'];
  onAddRemoteRepository: ComponentProps<typeof AddRepositoryDialog>['onAddRemote'];
  onCreateRepositoryGroup: ComponentProps<typeof AddRepositoryDialog>['onCreateGroup'];
  initialLocalPath?: string;
  onClearInitialLocalPath: NonNullable<
    ComponentProps<typeof AddRepositoryDialog>['onClearInitialLocalPath']
  >;
  actionPanelOpen: boolean;
  onActionPanelOpenChange: ComponentProps<typeof ActionPanel>['onOpenChange'];
  repositoryCollapsed: boolean;
  worktreeCollapsed: boolean;
  actionPanelProjectPath?: string;
  actionPanelRepositories: ComponentProps<typeof ActionPanel>['repositories'];
  actionPanelSelectedRepoPath?: string;
  actionPanelWorktrees: ComponentProps<typeof ActionPanel>['worktrees'];
  actionPanelActiveWorktreePath?: string;
  onToggleRepositoryPanel: ComponentProps<typeof ActionPanel>['onToggleRepository'];
  onToggleWorktreePanel: ComponentProps<typeof ActionPanel>['onToggleWorktree'];
  onOpenSettings: ComponentProps<typeof ActionPanel>['onOpenSettings'];
  onSwitchRepository: NonNullable<ComponentProps<typeof ActionPanel>['onSwitchRepo']>;
  onSwitchWorktree: NonNullable<ComponentProps<typeof ActionPanel>['onSwitchWorktree']>;
  autoUpdateEnabled: boolean;
  closeDialogOpen: boolean;
  setCloseDialogOpen: (open: boolean) => void;
  onDismissCloseDialog: () => void;
  onCancelClose: () => void;
  onConfirmClose: () => void;
  mergeWorktree: ComponentProps<typeof MergeWorktreeDialog>['worktree'] | null;
  mergeDialogOpen: boolean;
  onMergeDialogOpenChange: ComponentProps<typeof MergeWorktreeDialog>['onOpenChange'];
  mergeBranches: ComponentProps<typeof MergeWorktreeDialog>['branches'];
  mergeLoading?: boolean;
  onMerge: ComponentProps<typeof MergeWorktreeDialog>['onMerge'];
  onMergeConflicts?: ComponentProps<typeof MergeWorktreeDialog>['onConflicts'];
  onMergeSuccess?: ComponentProps<typeof MergeWorktreeDialog>['onSuccess'];
  mergeConflicts: WorktreeMergeResult | null;
  mergeWorkdir: string | null;
  mergeSourceBranch?: string;
  onResolveConflict: (file: string, content: string) => Promise<void>;
  onCompleteMerge: (message: string) => void | Promise<void>;
  onAbortMerge: () => void | Promise<void>;
  getConflictContent: (file: string) => Promise<MergeConflictContent>;
  showDraggableSettingsWindow: boolean;
  settingsWindowOpen: ComponentProps<typeof DraggableSettingsWindow>['open'];
  onSettingsWindowOpenChange: ComponentProps<typeof DraggableSettingsWindow>['onOpenChange'];
  settingsCategory?: ComponentProps<typeof DraggableSettingsWindow>['activeCategory'];
  onSettingsCategoryChange?: ComponentProps<typeof DraggableSettingsWindow>['onCategoryChange'];
  scrollToProvider?: ComponentProps<typeof DraggableSettingsWindow>['scrollToProvider'];
}

export function AppOverlays({
  onConfirmTempWorkspaceDelete,
  onConfirmTempWorkspaceRename,
  addRepositoryOpen,
  onAddRepositoryOpenChange,
  addRepositoryGroups,
  addRepositoryDefaultGroupId,
  onAddLocalRepository,
  onCloneRepository,
  onAddRemoteRepository,
  onCreateRepositoryGroup,
  initialLocalPath,
  onClearInitialLocalPath,
  actionPanelOpen,
  onActionPanelOpenChange,
  repositoryCollapsed,
  worktreeCollapsed,
  actionPanelProjectPath,
  actionPanelRepositories,
  actionPanelSelectedRepoPath,
  actionPanelWorktrees,
  actionPanelActiveWorktreePath,
  onToggleRepositoryPanel,
  onToggleWorktreePanel,
  onOpenSettings,
  onSwitchRepository,
  onSwitchWorktree,
  autoUpdateEnabled,
  closeDialogOpen,
  setCloseDialogOpen,
  onDismissCloseDialog,
  onCancelClose,
  onConfirmClose,
  mergeWorktree,
  mergeDialogOpen,
  onMergeDialogOpenChange,
  mergeBranches,
  mergeLoading,
  onMerge,
  onMergeConflicts,
  onMergeSuccess,
  mergeConflicts,
  mergeWorkdir,
  mergeSourceBranch,
  onResolveConflict,
  onCompleteMerge,
  onAbortMerge,
  getConflictContent,
  showDraggableSettingsWindow,
  settingsWindowOpen,
  onSettingsWindowOpenChange,
  settingsCategory,
  onSettingsCategoryChange,
  scrollToProvider,
}: AppOverlaysProps) {
  const { t } = useI18n();

  return (
    <>
      <TempWorkspaceDialogs
        onConfirmDelete={onConfirmTempWorkspaceDelete}
        onConfirmRename={onConfirmTempWorkspaceRename}
      />

      <AddRepositoryDialog
        open={addRepositoryOpen}
        onOpenChange={onAddRepositoryOpenChange}
        groups={addRepositoryGroups}
        defaultGroupId={addRepositoryDefaultGroupId}
        onAddLocal={onAddLocalRepository}
        onCloneComplete={onCloneRepository}
        onAddRemote={onAddRemoteRepository}
        onCreateGroup={onCreateRepositoryGroup}
        initialLocalPath={initialLocalPath}
        onClearInitialLocalPath={onClearInitialLocalPath}
      />

      <ActionPanel
        open={actionPanelOpen}
        onOpenChange={onActionPanelOpenChange}
        repositoryCollapsed={repositoryCollapsed}
        worktreeCollapsed={worktreeCollapsed}
        projectPath={actionPanelProjectPath}
        repositories={actionPanelRepositories}
        selectedRepoPath={actionPanelSelectedRepoPath}
        worktrees={actionPanelWorktrees}
        activeWorktreePath={actionPanelActiveWorktreePath}
        onToggleRepository={onToggleRepositoryPanel}
        onToggleWorktree={onToggleWorktreePanel}
        onOpenSettings={onOpenSettings}
        onSwitchRepo={onSwitchRepository}
        onSwitchWorktree={onSwitchWorktree}
      />

      <UpdateNotification autoUpdateEnabled={autoUpdateEnabled} />
      <UnsavedPromptHost />
      <RemoteAuthPromptHost />

      <Dialog
        open={closeDialogOpen}
        onOpenChange={(open) => {
          setCloseDialogOpen(open);
          if (!open) {
            onDismissCloseDialog();
          }
        }}
      >
        <DialogPopup className="sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t('Exit app')}</DialogTitle>
            <DialogDescription>{t('Are you sure you want to exit the app?')}</DialogDescription>
          </DialogHeader>
          <DialogFooter variant="bare">
            <Button
              variant="outline"
              onClick={() => {
                setCloseDialogOpen(false);
                onCancelClose();
              }}
            >
              {t('Cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setCloseDialogOpen(false);
                onConfirmClose();
              }}
            >
              {t('Exit')}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      {mergeWorktree ? (
        <MergeWorktreeDialog
          open={mergeDialogOpen}
          onOpenChange={onMergeDialogOpenChange}
          worktree={mergeWorktree}
          branches={mergeBranches}
          isLoading={mergeLoading}
          onMerge={onMerge}
          onConflicts={onMergeConflicts}
          onSuccess={onMergeSuccess}
        />
      ) : null}

      {mergeConflicts?.conflicts && mergeConflicts.conflicts.length > 0 ? (
        <Dialog open={true} onOpenChange={() => {}}>
          <DialogPopup className="h-[90vh] max-w-[95vw] p-0" showCloseButton={false}>
            <Suspense
              fallback={
                <div className="flex h-full min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
                  {t('Loading merge editor')}
                </div>
              }
            >
              <LazyMergeEditor
                conflicts={mergeConflicts.conflicts}
                workdir={mergeWorkdir || ''}
                sourceBranch={mergeSourceBranch}
                onResolve={onResolveConflict}
                onComplete={onCompleteMerge}
                onAbort={onAbortMerge}
                getConflictContent={getConflictContent}
              />
            </Suspense>
          </DialogPopup>
        </Dialog>
      ) : null}

      <CloneProgressFloat onCloneComplete={onCloneRepository} />

      {showDraggableSettingsWindow ? (
        <DraggableSettingsWindow
          open={settingsWindowOpen}
          onOpenChange={onSettingsWindowOpenChange}
          activeCategory={settingsCategory}
          onCategoryChange={onSettingsCategoryChange}
          scrollToProvider={scrollToProvider}
        />
      ) : null}
    </>
  );
}
