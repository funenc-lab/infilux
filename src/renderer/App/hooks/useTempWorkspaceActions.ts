import type { GitWorktree, TempWorkspaceItem } from '@shared/types';
import { useCallback } from 'react';
import { toastManager } from '@/components/ui/toast';
import { buildOperationToastCopy } from '@/lib/feedbackCopy';
import { TEMP_REPO_ID } from '../constants';
import { clearRemovedWorktreeUiState } from '../worktreeRemovalCleanup';
import { selectNextTempWorkspacePath } from './tempWorkspaceActionModel';

type TranslationFn = (key: string, params?: Record<string, string | number>) => string;

interface UseTempWorkspaceActionsOptions {
  activeWorktreePath: string | null;
  effectiveTempBasePath: string;
  safeTempWorkspaces: TempWorkspaceItem[];
  t: TranslationFn;
  addTempWorkspace: (item: TempWorkspaceItem) => void;
  removeTempWorkspace: (id: string) => void;
  clearEditorWorktreeState: (worktreePath: string) => void;
  clearWorktreeActivity: (worktreePath: string) => void;
  closeAgentSessions: (worktreePath: string) => void;
  closeTerminalSessions: (worktreePath: string) => void;
  setActiveWorktree: (worktree: GitWorktree | null) => void;
  selectWorktree: (worktree: GitWorktree, repoPath?: string) => Promise<void>;
}

export function useTempWorkspaceActions({
  activeWorktreePath,
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
  selectWorktree,
}: UseTempWorkspaceActionsOptions) {
  const handleSelectTempWorkspace = useCallback(
    async (path: string) => {
      await selectWorktree({ path } as GitWorktree, TEMP_REPO_ID);
    },
    [selectWorktree]
  );

  const handleCreateTempWorkspace = useCallback(async () => {
    const loadingCopy = buildOperationToastCopy(
      {
        phase: 'loading',
        kind: 'temp-session',
        action: 'create',
        label: t('Temp Session'),
      },
      t
    );
    const toastId = toastManager.add({
      type: 'loading',
      title: loadingCopy.title,
      description: loadingCopy.description,
      timeout: 0,
    });

    const result = await window.electronAPI.tempWorkspace.create(effectiveTempBasePath);
    if (!result.ok) {
      toastManager.close(toastId);
      const errorCopy = buildOperationToastCopy(
        {
          phase: 'error',
          kind: 'temp-session',
          action: 'create',
          message: result.message || t('Failed to create temp session'),
        },
        t
      );
      toastManager.add({
        type: 'error',
        title: errorCopy.title,
        description: errorCopy.description,
      });
      return;
    }

    addTempWorkspace(result.item);
    toastManager.close(toastId);
    const successCopy = buildOperationToastCopy(
      {
        phase: 'success',
        kind: 'temp-session',
        action: 'create',
        label: result.item.title,
      },
      t
    );
    toastManager.add({
      type: 'success',
      title: successCopy.title,
      description: successCopy.description,
    });
    await handleSelectTempWorkspace(result.item.path);
  }, [addTempWorkspace, effectiveTempBasePath, handleSelectTempWorkspace, t]);

  const handleRemoveTempWorkspace = useCallback(
    async (id: string) => {
      const target = safeTempWorkspaces.find((item) => item.id === id);
      if (!target) {
        return;
      }

      const loadingCopy = buildOperationToastCopy(
        {
          phase: 'loading',
          kind: 'temp-session',
          action: 'delete',
          label: target.title,
        },
        t
      );
      const toastId = toastManager.add({
        type: 'loading',
        title: loadingCopy.title,
        description: loadingCopy.description,
        timeout: 0,
      });

      closeAgentSessions(target.path);
      closeTerminalSessions(target.path);

      const result = await window.electronAPI.tempWorkspace.remove(
        target.path,
        effectiveTempBasePath
      );
      if (!result.ok) {
        toastManager.close(toastId);
        const errorCopy = buildOperationToastCopy(
          {
            phase: 'error',
            kind: 'temp-session',
            action: 'delete',
            message: result.message || t('Failed to delete temp session'),
          },
          t
        );
        toastManager.add({
          type: 'error',
          title: errorCopy.title,
          description: errorCopy.description,
        });
        return;
      }

      removeTempWorkspace(id);
      clearRemovedWorktreeUiState({
        worktreePath: target.path,
        activeWorktreePath,
        clearEditorWorktreeState,
        clearWorktreeActivity,
        setActiveWorktree,
      });

      if (activeWorktreePath === target.path) {
        const nextPath = selectNextTempWorkspacePath(safeTempWorkspaces, id);
        if (nextPath) {
          await handleSelectTempWorkspace(nextPath);
        } else {
          setActiveWorktree(null);
        }
      }

      toastManager.close(toastId);
      const successCopy = buildOperationToastCopy(
        {
          phase: 'success',
          kind: 'temp-session',
          action: 'delete',
          label: target.title,
        },
        t
      );
      toastManager.add({
        type: 'success',
        title: successCopy.title,
        description: successCopy.description,
      });
    },
    [
      activeWorktreePath,
      clearEditorWorktreeState,
      clearWorktreeActivity,
      closeAgentSessions,
      closeTerminalSessions,
      effectiveTempBasePath,
      handleSelectTempWorkspace,
      removeTempWorkspace,
      safeTempWorkspaces,
      setActiveWorktree,
      t,
    ]
  );

  return {
    handleSelectTempWorkspace,
    handleCreateTempWorkspace,
    handleRemoveTempWorkspace,
  };
}
