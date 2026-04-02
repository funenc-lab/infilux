import { useShallow } from 'zustand/shallow';
import { normalizePath } from '@/App/storage';
import type { GlowState } from '@/components/ui/glow-card';
import {
  computeHighestOutputState,
  type OutputState,
  useAgentSessionsStore,
} from '@/stores/agentSessions';

export function mapOutputStateToGlowState(outputState: OutputState): GlowState {
  switch (outputState) {
    case 'outputting':
      return 'running';
    case 'unread':
      return 'completed';
    default:
      return 'idle';
  }
}

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
      return mapOutputStateToGlowState(computeHighestOutputState(repoSessions, s.runtimeStates));
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
      return mapOutputStateToGlowState(
        computeHighestOutputState(worktreeSessions, s.runtimeStates)
      );
    })
  );
}

/**
 * Hook to get output state for a single session
 */
export function useSessionOutputState(sessionId: string): GlowState {
  return useAgentSessionsStore((s) =>
    mapOutputStateToGlowState(s.runtimeStates[sessionId]?.outputState ?? 'idle')
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
