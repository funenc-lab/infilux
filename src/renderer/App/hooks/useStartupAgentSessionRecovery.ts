import type { GitWorktree } from '@shared/types';
import { useEffect } from 'react';
import { restoreWorktreeAgentSessions } from '@/components/chat/agentSessionRecovery';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { TEMP_REPO_ID } from '../constants';
import { normalizePath } from '../storage';

interface UseStartupAgentSessionRecoveryOptions {
  selectedRepo: string | null;
  activeWorktree: GitWorktree | null;
  selectedRepoCanLoad: boolean;
  worktreesFetched: boolean;
  worktreesFetching: boolean;
  availableWorktreePaths: string[];
}

function hasValidatedActiveWorktreePath(
  activeWorktreePath: string | null,
  availableWorktreePaths: string[]
): boolean {
  if (!activeWorktreePath) {
    return false;
  }

  const normalizedActivePath = normalizePath(activeWorktreePath);
  return availableWorktreePaths.some((path) => normalizePath(path) === normalizedActivePath);
}

export function useStartupAgentSessionRecovery({
  selectedRepo,
  activeWorktree,
  selectedRepoCanLoad,
  worktreesFetched,
  worktreesFetching,
  availableWorktreePaths,
}: UseStartupAgentSessionRecoveryOptions): void {
  const upsertRecoveredSession = useAgentSessionsStore((state) => state.upsertRecoveredSession);
  const updateGroupState = useAgentSessionsStore((state) => state.updateGroupState);
  const activeWorktreePath = activeWorktree?.path ?? null;

  useEffect(() => {
    if (!selectedRepo || selectedRepo === TEMP_REPO_ID) {
      return;
    }
    if (!selectedRepoCanLoad || !worktreesFetched || worktreesFetching || !activeWorktreePath) {
      return;
    }
    if (!hasValidatedActiveWorktreePath(activeWorktreePath, availableWorktreePaths)) {
      return;
    }

    void restoreWorktreeAgentSessions({
      repoPath: selectedRepo,
      cwd: activeWorktreePath,
      restoreWorktreeSessions: window.electronAPI.agentSession.restoreWorktreeSessions,
      upsertRecoveredSession,
      updateGroupState,
    }).catch((error) => {
      console.error(
        '[useStartupAgentSessionRecovery] Failed to prewarm startup agent sessions',
        error
      );
    });
  }, [
    activeWorktreePath,
    availableWorktreePaths,
    selectedRepo,
    selectedRepoCanLoad,
    updateGroupState,
    upsertRecoveredSession,
    worktreesFetched,
    worktreesFetching,
  ]);
}
