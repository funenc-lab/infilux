import { getActivityStateMeta } from '@/components/ui/activityStatus';
import type { AgentActivityState } from '@/stores/worktreeActivity';

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
      data-state={state}
      className="control-tree-state-marker"
    />
  );
}
