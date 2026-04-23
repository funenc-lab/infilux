import { useShallow } from 'zustand/shallow';
import { normalizePath } from '@/App/storage';
import type { GlowState } from '@/components/ui/glow-card';
import {
  computeHighestOutputState,
  type OutputState,
  useAgentSessionsStore,
} from '@/stores/agentSessions';
import type { AgentActivityState } from '@/stores/worktreeActivity';
import { useWorktreeActivityStore } from '@/stores/worktreeActivity';

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

export function resolveActivityGlowState({
  outputState,
  activityState,
}: {
  outputState: OutputState;
  activityState: AgentActivityState;
}): GlowState {
  if (activityState === 'waiting_input') {
    return 'waiting_input';
  }

  if (activityState === 'running' || outputState === 'outputting') {
    return 'running';
  }

  if (activityState === 'completed' || outputState === 'unread') {
    return 'completed';
  }

  return 'idle';
}

/**
 * Hook to get aggregated output state for a repository
 * Returns the highest priority state among all sessions in the repo
 */
export function useRepoOutputState(repoPath: string): GlowState {
  const normalizedRepoPath = normalizePath(repoPath);
  const outputState = useAgentSessionsStore((s) =>
    computeHighestOutputState(
      s.sessions.filter((session) => normalizePath(session.repoPath) === normalizedRepoPath),
      s.runtimeStates
    )
  );
  const repoWorktreePaths = useAgentSessionsStore(
    useShallow((s) => {
      const uniqueWorktreePaths = new Set<string>();

      for (const session of s.sessions) {
        if (normalizePath(session.repoPath) === normalizedRepoPath) {
          uniqueWorktreePaths.add(normalizePath(session.cwd));
        }
      }

      return [...uniqueWorktreePaths];
    })
  );
  const activityState = useWorktreeActivityStore((s) => {
    let highestState: AgentActivityState = 'idle';

    for (const worktreePath of repoWorktreePaths) {
      const nextState = s.activityStates[worktreePath] ?? 'idle';
      if (nextState === 'waiting_input') {
        return nextState;
      }
      if (nextState === 'running') {
        highestState = 'running';
        continue;
      }
      if (nextState === 'completed' && highestState === 'idle') {
        highestState = 'completed';
      }
    }

    return highestState;
  });

  return resolveActivityGlowState({ outputState, activityState });
}

/**
 * Hook to get aggregated output state for a worktree
 * Returns the highest priority state among all sessions in the worktree
 */
export function useWorktreeOutputState(worktreePath: string): GlowState {
  const normalizedWorktreePath = normalizePath(worktreePath);
  const outputState = useAgentSessionsStore((s) =>
    computeHighestOutputState(
      s.sessions.filter((session) => normalizePath(session.cwd) === normalizedWorktreePath),
      s.runtimeStates
    )
  );
  const activityState = useWorktreeActivityStore((s) => s.activityStates[worktreePath] ?? 'idle');

  return resolveActivityGlowState({ outputState, activityState });
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
  const normalizedWorktreePath = normalizePath(worktreePath);
  return useAgentSessionsStore((s) =>
    s.sessions.some(
      (session) =>
        normalizePath(session.cwd) === normalizedWorktreePath &&
        s.runtimeStates[session.id]?.hasCompletedTaskUnread === true
    )
  );
}

/**
 * Hook to determine whether a session has an unread task completion marker.
 */
export function useSessionTaskCompletionNotice(sessionId: string): boolean {
  return useAgentSessionsStore((s) => s.runtimeStates[sessionId]?.hasCompletedTaskUnread === true);
}
