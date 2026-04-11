import type { GitWorktree } from '@shared/types';
import { useQueryClient } from '@tanstack/react-query';
import type { MutableRefObject } from 'react';
import { useCallback, useEffect } from 'react';
import { restoreWorktreeAgentSessions } from '@/components/chat/agentSessionRecovery';
import { toastManager } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { buildFileWorkflowToastCopy } from '@/lib/feedbackCopy';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { useEditorStore } from '@/stores/editor';
import { useSettingsStore } from '@/stores/settings';
import { requestUnsavedChoice } from '@/stores/unsavedPrompt';
import type { TabId } from '../constants';
import {
  resolveWorktreeTabForPersistence,
  resolveWorktreeTabForRestore,
} from '../settingsWorktreeTabPolicy';

export function useWorktreeSelection(
  activeWorktree: GitWorktree | null,
  setActiveWorktree: (worktree: GitWorktree | null) => void,
  currentWorktreePathRef: MutableRefObject<string | null>,
  worktreeTabMap: Record<string, TabId>,
  setWorktreeTabMap: (fn: (prev: Record<string, TabId>) => Record<string, TabId>) => void,
  activeTab: TabId,
  previousTab: TabId | null,
  setActiveTab: (tab: TabId) => void,
  selectedRepo: string | null,
  setSelectedRepo: (repo: string) => void,
  persistSelectedWorktree: (repoPath: string, worktree: GitWorktree) => void,
  requestAgentCanvasRecenter?: (worktreePath: string) => void
) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const getAgentSessions = useAgentSessionsStore((s) => s.getSessions);
  const upsertRecoveredSession = useAgentSessionsStore((s) => s.upsertRecoveredSession);
  const updateGroupState = useAgentSessionsStore((s) => s.updateGroupState);
  const editorSettings = useSettingsStore((s) => s.editorSettings);
  const settingsDisplayMode = useSettingsStore((s) => s.settingsDisplayMode);
  const switchEditorWorktree = useEditorStore((s) => s.switchWorktree);
  const currentEditorWorktree = useEditorStore((s) => s.currentWorktreePath);

  // Sync editor state with active worktree
  useEffect(() => {
    const targetPath = activeWorktree?.path ?? null;
    if (targetPath !== currentEditorWorktree) {
      switchEditorWorktree(targetPath);
    }
  }, [activeWorktree, currentEditorWorktree, switchEditorWorktree]);

  // Helper function to refresh git data for a worktree
  const refreshGitData = useCallback(
    (worktreePath: string) => {
      // Update ref to track current worktree for race condition prevention
      currentWorktreePathRef.current = worktreePath;

      // Immediately refresh local git data
      const localKeys = [
        'status',
        'file-changes',
        'file-diff',
        'log',
        'log-infinite',
        'submodules',
      ];
      for (const key of localKeys) {
        queryClient.invalidateQueries({ queryKey: ['git', key, worktreePath] });
      }
      queryClient.invalidateQueries({
        queryKey: ['git', 'submodule', 'changes', worktreePath],
      });

      // Fetch remote then refresh branch data (with race condition check)
      window.electronAPI.git
        .fetch(worktreePath)
        .then(() => {
          // Only refresh if this is still the current worktree
          if (currentWorktreePathRef.current === worktreePath) {
            queryClient.invalidateQueries({
              queryKey: ['git', 'branches', worktreePath],
            });
            queryClient.invalidateQueries({
              queryKey: ['git', 'status', worktreePath],
            });
          }
        })
        .catch(() => {
          // Silent fail - fetch errors are not critical
        });
    },
    [queryClient, currentWorktreePathRef]
  );

  const handleSelectWorktree = useCallback(
    async (worktree: GitWorktree, nextRepoPath?: string) => {
      if (editorSettings.autoSave === 'off') {
        const editorState = useEditorStore.getState();
        const dirtyTabs = editorState.tabs.filter((tab) => tab.isDirty);

        for (const tab of dirtyTabs) {
          const fileName = tab.path.split(/[/\\]/).pop() ?? tab.path;
          const choice = await requestUnsavedChoice(fileName);

          if (choice === 'cancel') {
            return;
          }

          if (choice === 'save') {
            try {
              await window.electronAPI.file.write(tab.path, tab.content, tab.encoding);
              useEditorStore.getState().markFileSaved(tab.path);
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              const errorCopy = buildFileWorkflowToastCopy(
                { action: 'file-save', phase: 'error', message },
                t
              );
              toastManager.add({
                type: 'error',
                title: errorCopy.title,
                description: errorCopy.description,
              });
              return;
            }
          } else {
            try {
              const { content, isBinary } = await window.electronAPI.file.read(tab.path);
              if (!isBinary) {
                useEditorStore.getState().updateFileContent(tab.path, content, false);
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              const errorCopy = buildFileWorkflowToastCopy(
                { action: 'file-read', phase: 'error', message },
                t
              );
              toastManager.add({
                type: 'error',
                title: errorCopy.title,
                description: errorCopy.description,
              });
              return;
            }
          }
        }
      }

      if (nextRepoPath && nextRepoPath !== selectedRepo) {
        setSelectedRepo(nextRepoPath);
      }

      const targetRepoPath = nextRepoPath ?? selectedRepo;
      if (targetRepoPath) {
        persistSelectedWorktree(targetRepoPath, worktree);
      }

      // Save current worktree's tab state before switching
      if (activeWorktree?.path) {
        const persistedTab = resolveWorktreeTabForPersistence({
          activeTab,
          previousTab,
          settingsDisplayMode,
        });
        setWorktreeTabMap((prev) => ({
          ...prev,
          [activeWorktree.path]: persistedTab,
        }));
      }

      // Switch to new worktree
      setActiveWorktree(worktree);
      requestAgentCanvasRecenter?.(worktree.path);

      if (targetRepoPath) {
        void restoreWorktreeAgentSessions({
          repoPath: targetRepoPath,
          cwd: worktree.path,
          restoreWorktreeSessions: window.electronAPI.agentSession.restoreWorktreeSessions,
          upsertRecoveredSession,
          updateGroupState,
        }).catch((error) => {
          console.error('[useWorktreeSelection] Failed to prewarm agent sessions', error);
        });
      }

      const hasAgentSessions =
        targetRepoPath !== null && targetRepoPath !== undefined
          ? getAgentSessions(targetRepoPath, worktree.path).length > 0
          : false;

      // Show the agent empty state when the worktree has no session context yet.
      const savedTab = hasAgentSessions
        ? resolveWorktreeTabForRestore({
            savedTab: worktreeTabMap[worktree.path],
            settingsDisplayMode,
          })
        : 'chat';
      setActiveTab(savedTab);

      // Refresh git data for the new worktree
      refreshGitData(worktree.path);
    },
    [
      activeWorktree,
      activeTab,
      previousTab,
      worktreeTabMap,
      editorSettings.autoSave,
      settingsDisplayMode,
      t,
      refreshGitData,
      getAgentSessions,
      selectedRepo,
      setSelectedRepo,
      persistSelectedWorktree,
      upsertRecoveredSession,
      updateGroupState,
      setActiveWorktree,
      setWorktreeTabMap,
      setActiveTab,
      requestAgentCanvasRecenter,
    ]
  );

  return {
    refreshGitData,
    handleSelectWorktree,
  };
}
