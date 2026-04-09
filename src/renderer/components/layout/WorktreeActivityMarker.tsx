import { getActivityStateMeta } from '@/components/ui/activityStatus';
import { cn } from '@/lib/utils';
import type { AgentActivityState } from '@/stores/worktreeActivity';

const WORKTREE_ACTIVITY_MARKER_CLASS_NAME: Record<Exclude<AgentActivityState, 'idle'>, string> = {
  running: 'bg-[color:var(--control-live)]',
  waiting_input: 'bg-[color:var(--control-wait)]',
  completed: 'bg-[color:var(--control-done)]',
};

export function WorktreeActivityMarker({ state }: { state: AgentActivityState }) {
  if (state === 'idle') {
    return null;
  }

  const activityMeta = getActivityStateMeta(state);

  return (
    <span
      role="img"
      aria-label={activityMeta.label}
      title={activityMeta.label}
      className={cn(
        'control-tree-state-dot inline-flex h-1.5 w-1.5 shrink-0 rounded-full',
        WORKTREE_ACTIVITY_MARKER_CLASS_NAME[state]
      )}
    />
  );
}
