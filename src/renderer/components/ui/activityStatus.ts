import type { GlowState } from '@/components/ui/glow-card';
import type { AgentActivityState } from '@/stores/worktreeActivity';

export type ActivityVisualState = GlowState | AgentActivityState;

interface ActivityStateMeta {
  shortLabel: string;
  label: string;
  chipClassName: string;
  dotClassName: string;
}

interface MainContentLiveStatusInput {
  currentActivityState: AgentActivityState;
  outputtingSessionsCount: number;
  unreadSessionsCount: number;
  hasActiveWorktree: boolean;
}

const ACTIVITY_STATE_META: Record<ActivityVisualState, ActivityStateMeta> = {
  idle: {
    shortLabel: 'IDLE',
    label: 'Idle',
    chipClassName: '',
    dotClassName: 'bg-[color:var(--control-idle)]',
  },
  running: {
    shortLabel: 'LIVE',
    label: 'Running',
    chipClassName: 'control-chip-live',
    dotClassName: 'bg-[color:var(--control-live)]',
  },
  waiting_input: {
    shortLabel: 'WAIT',
    label: 'Waiting for input',
    chipClassName: 'control-chip-wait',
    dotClassName: 'bg-[color:var(--control-wait)]',
  },
  completed: {
    shortLabel: 'DONE',
    label: 'Completed',
    chipClassName: 'control-chip-done',
    dotClassName: 'bg-[color:var(--control-done)]',
  },
};

export function getActivityStateMeta(state: ActivityVisualState): ActivityStateMeta {
  return ACTIVITY_STATE_META[state];
}

export function getMainContentLiveStatus({
  currentActivityState,
  outputtingSessionsCount,
  unreadSessionsCount,
  hasActiveWorktree,
}: MainContentLiveStatusInput): {
  chipClassName: string;
  label: string;
} {
  if (currentActivityState === 'waiting_input') {
    return {
      chipClassName: ACTIVITY_STATE_META.waiting_input.chipClassName,
      label: ACTIVITY_STATE_META.waiting_input.label,
    };
  }

  if (outputtingSessionsCount > 0 || currentActivityState === 'running') {
    return {
      chipClassName: ACTIVITY_STATE_META.running.chipClassName,
      label: 'Live execution',
    };
  }

  if (unreadSessionsCount > 0 || currentActivityState === 'completed') {
    return {
      chipClassName: ACTIVITY_STATE_META.completed.chipClassName,
      label: 'Review ready',
    };
  }

  return {
    chipClassName: '',
    label: hasActiveWorktree ? 'Ready' : 'No worktree selected',
  };
}
