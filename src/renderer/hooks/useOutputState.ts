import { useShallow } from 'zustand/shallow';
import { normalizePath } from '@/App/storage';
import type { GlowState } from '@/components/ui/glow-card';
import { computeHighestOutputState, useAgentSessionsStore } from '@/stores/agentSessions';

/**
 * Hook to get aggregated output state for a repository
 * Returns the highest priority state among all sessions in the repo
 */
export function useRepoOutputState(repoPath: string): GlowState {
  return useAgentSessionsStore(
    useShallow((s) => {
      const normalizedRepoPath = normalizePath(repoPath);
      const repoSessions = s.sessions.filter(
        (session) => normalizePath(session.repoPath) === normalizedRepoPath
      );
      return computeHighestOutputState(repoSessions, s.runtimeStates) as GlowState;
    })
  );
}

/**
 * Hook to get aggregated output state for a worktree
 * Returns the highest priority state among all sessions in the worktree
 */
export function useWorktreeOutputState(worktreePath: string): GlowState {
  return useAgentSessionsStore(
    useShallow((s) => {
      const normalizedCwd = normalizePath(worktreePath);
      const worktreeSessions = s.sessions.filter(
        (session) => normalizePath(session.cwd) === normalizedCwd
      );
      return computeHighestOutputState(worktreeSessions, s.runtimeStates) as GlowState;
    })
  );
}

/**
 * Hook to get output state for a single session
 */
export function useSessionOutputState(sessionId: string): GlowState {
  return useAgentSessionsStore(
    (s) => (s.runtimeStates[sessionId]?.outputState ?? 'idle') as GlowState
  );
}

/**
 * Hook to determine whether a worktree has any unread task completion markers.
 */
export function useWorktreeTaskCompletionNotice(worktreePath: string): boolean {
  return useAgentSessionsStore(
    useShallow((s) => {
      const normalizedCwd = normalizePath(worktreePath);
      return s.sessions.some(
        (session) =>
          normalizePath(session.cwd) === normalizedCwd &&
          s.runtimeStates[session.id]?.hasCompletedTaskUnread === true
      );
    })
  );
}

/**
 * Hook to determine whether a session has an unread task completion marker.
 */
export function useSessionTaskCompletionNotice(sessionId: string): boolean {
  return useAgentSessionsStore((s) => s.runtimeStates[sessionId]?.hasCompletedTaskUnread === true);
}
