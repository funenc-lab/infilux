import { useEffect } from 'react';
import type { AgentActivityState } from '@/stores/worktreeActivity';
import { useWorktreeActivityStore } from '@/stores/worktreeActivity';

export const COMPLETED_WORKTREE_ACTIVITY_CLEAR_DELAY_MS = 5000;

interface UseCompletedWorktreeActivityClearOptions {
  activityState: AgentActivityState;
  isActive: boolean;
  worktreePath: string;
}

export function useCompletedWorktreeActivityClear({
  activityState,
  isActive,
  worktreePath,
}: UseCompletedWorktreeActivityClearOptions) {
  useEffect(() => {
    if (!isActive || activityState !== 'completed') {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      useWorktreeActivityStore.getState().clearActivityState(worktreePath);
    }, COMPLETED_WORKTREE_ACTIVITY_CLEAR_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [activityState, isActive, worktreePath]);
}
