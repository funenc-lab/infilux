import type { StatusData } from '@/stores/agentStatus';
import type { Session } from './SessionBar';
import { getSessionRolloverSignal } from './sessionRolloverSignal';
import type { AgentGroupState } from './types';

export interface AutoSessionRolloverTarget {
  groupId: string;
  percent: number;
  session: Session;
}

interface FindAutoSessionRolloverTargetOptions {
  groupState: AgentGroupState;
  sessions: Session[];
  statuses: Record<string, StatusData>;
  handledSessionIds: ReadonlySet<string>;
}

function resolveActiveGroup(groupState: AgentGroupState) {
  if (groupState.groups.length === 0) {
    return null;
  }

  return (
    groupState.groups.find((group) => group.id === groupState.activeGroupId) ?? groupState.groups[0]
  );
}

export function findAutoSessionRolloverTarget({
  groupState,
  sessions,
  statuses,
  handledSessionIds,
}: FindAutoSessionRolloverTargetOptions): AutoSessionRolloverTarget | null {
  const activeGroup = resolveActiveGroup(groupState);
  const activeSessionId = activeGroup?.activeSessionId;
  if (!activeGroup || !activeSessionId || handledSessionIds.has(activeSessionId)) {
    return null;
  }

  const session = sessions.find((candidate) => candidate.id === activeSessionId);
  if (!session || !session.initialized || !session.activated) {
    return null;
  }

  const status = statuses[activeSessionId];
  if (!status?.contextWindow) {
    return null;
  }

  const signal = getSessionRolloverSignal({
    contextWindowSize: status.contextWindow.contextWindowSize,
    currentUsage: status.contextWindow.currentUsage,
  });
  if (!signal || signal.level !== 'critical') {
    return null;
  }

  return {
    groupId: activeGroup.id,
    percent: signal.percent,
    session,
  };
}
