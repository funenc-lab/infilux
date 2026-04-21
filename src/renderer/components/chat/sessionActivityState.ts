import type { LiveAgentSubagent } from '@shared/types';
import { normalizePath } from '@/App/storage';
import { getMatchedSessionSubagents } from './sessionSubagentState';

type OutputState = 'idle' | 'outputting' | 'unread';

export type SessionActivityState = 'idle' | 'running' | 'waiting_input' | 'completed';

interface SessionLike {
  id: string;
  agentId?: string;
  agentCommand?: string;
  sessionId?: string;
  cwd: string;
}

interface SessionRuntimeLike {
  outputState?: OutputState;
  lastActivityAt?: number;
  wasActiveWhenOutputting?: boolean;
  hasCompletedTaskUnread?: boolean;
  waitingForInput?: boolean;
}

interface ResolveSessionActivityStateOptions {
  agentId?: string;
  agentCommand?: string;
  outputState?: OutputState;
  hasCompletedTaskUnread?: boolean;
  waitingForInput?: boolean;
  providerSessionId?: string;
  subagents?: LiveAgentSubagent[];
}

interface BuildSessionActivityStateBySessionIdOptions {
  sessions: SessionLike[];
  runtimeStates: Record<string, SessionRuntimeLike | undefined>;
  subagentsByWorktree: Map<string, LiveAgentSubagent[]>;
}

function getSessionActivityStatePriority(state: SessionActivityState): number {
  switch (state) {
    case 'waiting_input':
      return 3;
    case 'running':
      return 2;
    case 'completed':
      return 1;
    default:
      return 0;
  }
}

export function resolveSessionActivityState({
  agentId,
  agentCommand,
  outputState = 'idle',
  hasCompletedTaskUnread = false,
  waitingForInput = false,
  providerSessionId,
  subagents = [],
}: ResolveSessionActivityStateOptions): SessionActivityState {
  const matchedSubagents = getMatchedSessionSubagents(
    agentId,
    agentCommand,
    providerSessionId,
    subagents
  );
  const hasWaitingSubagent = matchedSubagents.some((subagent) => subagent.status === 'waiting');
  const hasRunningSubagent = matchedSubagents.some((subagent) => subagent.status === 'running');

  if (waitingForInput || hasWaitingSubagent) {
    return 'waiting_input';
  }

  if (outputState === 'outputting' || hasRunningSubagent) {
    return 'running';
  }

  if (outputState === 'unread' || hasCompletedTaskUnread) {
    return 'completed';
  }

  return 'idle';
}

export function getHighestSessionActivityState(
  states: Iterable<SessionActivityState>
): SessionActivityState {
  let highestState: SessionActivityState = 'idle';
  let highestPriority = getSessionActivityStatePriority(highestState);

  for (const state of states) {
    const priority = getSessionActivityStatePriority(state);
    if (priority > highestPriority) {
      highestState = state;
      highestPriority = priority;
    }
  }

  return highestState;
}

export function buildSessionActivityStateBySessionId({
  sessions,
  runtimeStates,
  subagentsByWorktree,
}: BuildSessionActivityStateBySessionIdOptions): Record<string, SessionActivityState> {
  const activityStatesBySessionId: Record<string, SessionActivityState> = {};

  for (const session of sessions) {
    const runtimeState = runtimeStates[session.id];
    const subagents = subagentsByWorktree.get(normalizePath(session.cwd)) ?? [];

    activityStatesBySessionId[session.id] = resolveSessionActivityState({
      agentId: session.agentId,
      agentCommand: session.agentCommand,
      outputState: runtimeState?.outputState ?? 'idle',
      hasCompletedTaskUnread: runtimeState?.hasCompletedTaskUnread ?? false,
      waitingForInput: runtimeState?.waitingForInput ?? false,
      providerSessionId: session.sessionId,
      subagents,
    });
  }

  return activityStatesBySessionId;
}

export function computeHighestSessionActivityState(
  options: BuildSessionActivityStateBySessionIdOptions
): SessionActivityState {
  return getHighestSessionActivityState(
    Object.values(buildSessionActivityStateBySessionId(options))
  );
}
