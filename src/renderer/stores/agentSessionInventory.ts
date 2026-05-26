import { type AgentFamily, resolveBuiltinAgentCatalogEntry } from '@shared/types';
import { normalizePath, pathsEqual } from '@/App/storage';
import type { Session } from '@/components/chat/SessionBar';
import { getStoredSessionName } from '@/components/chat/sessionTitleText';
import type { TodoTask } from '@/components/todo/types';
import { isSessionPersistable } from '@/lib/agentSessionPersistence';
import type { SessionRuntimeState } from './agentSessions';

export type AgentSessionInventoryStatus =
  | 'running'
  | 'waiting-for-input'
  | 'reconnecting'
  | 'disconnected'
  | 'unread'
  | 'idle'
  | 'dead';

export interface AgentSessionInventoryItem {
  sessionId: string;
  providerSessionId?: string;
  backendSessionId?: string;
  displayName: string;
  agentId: string;
  agentFamily: AgentFamily;
  agentName: string;
  agentCommand: string;
  repoPath: string;
  cwd: string;
  environment: NonNullable<Session['environment']>;
  status: AgentSessionInventoryStatus;
  isActive: boolean;
  isRecoverable: boolean;
  isStale: boolean;
  lastActivityAt: number;
  taskCompletionUnread: boolean;
  task?: AgentSessionInventoryTaskSummary;
}

export interface AgentSessionInventoryTaskSummary {
  id: string;
  title: string;
  priority: TodoTask['priority'];
  status: TodoTask['status'];
}

export interface AgentSessionInventoryFilters {
  repoPath?: string;
  cwd?: string;
}

export interface BuildAgentSessionInventoryOptions {
  sessions: Session[];
  activeIds: Record<string, string | null>;
  runtimeStates: Record<string, SessionRuntimeState>;
  tasks?: TodoTask[];
  filters?: AgentSessionInventoryFilters;
}

function resolveInventoryStatus(
  session: Session,
  runtimeState: SessionRuntimeState | undefined
): AgentSessionInventoryStatus {
  if (session.recoveryState === 'dead') {
    return 'dead';
  }
  if (session.recoveryState === 'reconnecting') {
    return 'reconnecting';
  }
  if (session.recoveryState === 'missing-host-session') {
    return 'disconnected';
  }
  if (runtimeState?.waitingForInput) {
    return 'waiting-for-input';
  }
  if (runtimeState?.outputState === 'outputting') {
    return 'running';
  }
  if (runtimeState?.outputState === 'unread') {
    return 'unread';
  }
  return 'idle';
}

function matchesInventoryFilters(session: Session, filters: AgentSessionInventoryFilters): boolean {
  if (filters.repoPath && !pathsEqual(session.repoPath, filters.repoPath)) {
    return false;
  }
  if (filters.cwd && !pathsEqual(session.cwd, filters.cwd)) {
    return false;
  }
  return true;
}

function sortInventoryItems(
  left: AgentSessionInventoryItem,
  right: AgentSessionInventoryItem
): number {
  if (right.lastActivityAt !== left.lastActivityAt) {
    return right.lastActivityAt - left.lastActivityAt;
  }
  return left.displayName.localeCompare(right.displayName);
}

function buildTaskBySessionId(tasks: TodoTask[] | undefined): Map<string, TodoTask> {
  const taskBySessionId = new Map<string, TodoTask>();
  for (const task of tasks ?? []) {
    if (task.sessionId) {
      taskBySessionId.set(task.sessionId, task);
    }
  }
  return taskBySessionId;
}

function buildTaskSummary(
  task: TodoTask | undefined
): AgentSessionInventoryTaskSummary | undefined {
  if (!task) {
    return undefined;
  }
  return {
    id: task.id,
    title: task.title,
    priority: task.priority,
    status: task.status,
  };
}

function isRecoverableInventorySession(session: Session): boolean {
  if (!isSessionPersistable(session)) {
    return false;
  }

  return session.recoveryState === undefined || session.recoveryState === 'live'
    ? true
    : session.recoveryState === 'reconnecting';
}

export function buildAgentSessionInventory({
  activeIds,
  filters = {},
  runtimeStates,
  sessions,
  tasks,
}: BuildAgentSessionInventoryOptions): AgentSessionInventoryItem[] {
  const taskBySessionId = buildTaskBySessionId(tasks);
  return sessions
    .filter((session) => matchesInventoryFilters(session, filters))
    .map((session) => {
      const runtimeState = runtimeStates[session.id];
      const catalogEntry = resolveBuiltinAgentCatalogEntry(session.agentId, session.agentCommand);
      const capabilities = catalogEntry?.capabilities;
      const normalizedCwd = normalizePath(session.cwd);
      const lastActivityAt = runtimeState?.lastActivityAt ?? session.createdAt ?? 0;
      const task = buildTaskSummary(taskBySessionId.get(session.id));

      return {
        sessionId: session.id,
        providerSessionId: session.sessionId,
        backendSessionId: session.backendSessionId,
        displayName: getStoredSessionName(session.name, session.agentId),
        agentId: session.agentId,
        agentFamily: capabilities?.agentFamily ?? 'custom',
        agentName: catalogEntry?.name ?? session.agentId,
        agentCommand: session.agentCommand,
        repoPath: session.repoPath,
        cwd: session.cwd,
        environment: session.environment ?? 'native',
        status: resolveInventoryStatus(session, runtimeState),
        isActive: activeIds[normalizedCwd] === session.id,
        isRecoverable: isRecoverableInventorySession(session),
        isStale: Boolean(session.agentCapabilityStale || session.claudePolicyStale),
        lastActivityAt,
        taskCompletionUnread: Boolean(runtimeState?.hasCompletedTaskUnread),
        ...(task ? { task } : {}),
      };
    })
    .sort(sortInventoryItems);
}
