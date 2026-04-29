import type { AgentStopNotificationData } from '@shared/types/agent';
import { TASK_COMPLETION_MARKER } from '@shared/types/agent';
import { normalizePath } from '@/App/storage';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { INITIAL_AUTO_EXECUTE, useTodoStore } from '@/stores/todo';
import { resolveAutoExecuteAgentChoice } from './agentCapabilities';
import { buildTodoTaskExecutionContext, buildTodoTaskPrompt } from './todoTaskContext';
import type { AutoExecuteState, TodoTaskContext } from './types';
import type { ResolvedAgent } from './useEnabledAgents';

export interface ExecuteTodoTaskOptions {
  repoPath: string;
  taskId: string;
  enabledAgents?: readonly ResolvedAgent[];
  selectedAgentId?: string;
  worktreePath?: string;
  onSwitchToAgent?: () => void;
}

export interface StartTodoAutoExecuteQueueOptions {
  repoPath: string;
  taskIds: readonly string[];
  enabledAgents?: readonly ResolvedAgent[];
  selectedAgentId?: string;
  worktreePath?: string;
  onSwitchToAgent?: () => void;
}

export interface TodoGlobalDispatchTask {
  repoPath: string;
  taskId: string;
}

export interface StartTodoGlobalAutoExecuteOptions {
  dispatchableTasks: readonly TodoGlobalDispatchTask[];
  enabledAgents?: readonly ResolvedAgent[];
  selectedAgentId?: string;
  worktreePathByRepo?: Readonly<Record<string, string | undefined>>;
  onSwitchToAgent?: () => void;
}

export interface HandleTodoAutoExecuteStopOptions {
  data: AgentStopNotificationData;
  enabledAgents?: readonly ResolvedAgent[];
  selectedAgentId?: string;
  repoPath?: string;
  worktreePath?: string;
  worktreePathByRepo?: Readonly<Record<string, string | undefined>>;
  onSwitchToAgent?: () => void;
}

interface RunningExecutionMatch {
  repoKey: string;
  autoExecute: AutoExecuteState;
}

/**
 * Build prompt with auto-execute rules.
 */
export function buildAutoExecutePrompt(
  title: string,
  description?: string,
  context?: TodoTaskContext
): string {
  const taskPrompt = buildTodoTaskPrompt(title, description, context);
  return `
${taskPrompt}

---
[AUTO-EXECUTE RULES - MUST FOLLOW]
1. When task is complete, output the following marker on a separate line at the end of your response: ${TASK_COMPLETION_MARKER}
2. Do NOT call AskUserQuestion tool. Do NOT ask user to choose options. Directly select and execute the best approach.
3. Solve problems autonomously. Do NOT interrupt the workflow to wait for user input.
4. Run the relevant project validation commands before completion, such as typecheck, lint, tests, or the nearest targeted equivalent.
5. Do not print the completion marker until validation has passed or you have clearly reported the blocking validation failure.
`.trim();
}

/**
 * Find the UI session ID matching a provider session ID.
 * Provider session IDs from hooks can differ from UI session IDs.
 */
function findUISessionId(providerSessionId: string): string | undefined {
  const session = useAgentSessionsStore
    .getState()
    .sessions.find((item) => item.sessionId === providerSessionId || item.id === providerSessionId);
  return session?.id;
}

function isClaudeLikeSession(sessionId: string | undefined): boolean {
  if (!sessionId) {
    return false;
  }

  const session = useAgentSessionsStore.getState().sessions.find((item) => item.id === sessionId);
  const agentId = session?.agentId.toLowerCase() ?? '';
  const agentCommand = session?.agentCommand.toLowerCase().trim() ?? '';
  return (
    agentId === 'claude' ||
    agentId.startsWith('claude-') ||
    agentCommand === 'claude' ||
    agentCommand.startsWith('claude ')
  );
}

function hasAgents(
  agents: readonly ResolvedAgent[] | undefined
): agents is readonly ResolvedAgent[] {
  return Array.isArray(agents) && agents.length > 0;
}

function findMatchingExecution(
  uiSessionId: string,
  repoPath: string | undefined
): RunningExecutionMatch | undefined {
  const autoExecuteByRepo = useTodoStore.getState().autoExecute;

  if (repoPath) {
    const repoKey = normalizePath(repoPath);
    const autoExecute = autoExecuteByRepo[repoKey] ?? INITIAL_AUTO_EXECUTE;
    return autoExecute.running && autoExecute.currentSessionId === uiSessionId
      ? { repoKey, autoExecute }
      : undefined;
  }

  for (const [repoKey, autoExecute] of Object.entries(autoExecuteByRepo)) {
    if (autoExecute.running && autoExecute.currentSessionId === uiSessionId) {
      return { repoKey, autoExecute };
    }
  }

  return undefined;
}

function getRepoWorktreePath(
  repoPath: string,
  worktreePath: string | undefined,
  worktreePathByRepo: Readonly<Record<string, string | undefined>> | undefined
): string | undefined {
  return worktreePathByRepo?.[normalizePath(repoPath)] ?? worktreePath;
}

function resolveTaskWorktreePath({
  repoKey,
  task,
  worktreePath,
}: {
  repoKey: string;
  task: { context?: TodoTaskContext };
  worktreePath?: string;
}): { promptContext?: TodoTaskContext; worktreePath?: string } {
  const promptContext = buildTodoTaskExecutionContext(task, {
    repoPath: repoKey,
    worktreePath,
  });

  return {
    promptContext,
    worktreePath: promptContext?.worktreePath ?? worktreePath,
  };
}

export function executeTodoTask({
  enabledAgents,
  onSwitchToAgent,
  repoPath,
  selectedAgentId,
  taskId,
  worktreePath,
}: ExecuteTodoTaskOptions): boolean {
  const repoKey = normalizePath(repoPath);
  const todoStore = useTodoStore.getState();

  if (!hasAgents(enabledAgents)) {
    todoStore.stopAutoExecute(repoKey);
    return false;
  }

  const tasks = todoStore.tasks[repoKey] ?? [];
  const task = tasks.find((item) => item.id === taskId);
  if (!task) {
    const nextTaskId = todoStore.advanceQueue(repoKey);
    if (nextTaskId) {
      return executeTodoTask({
        enabledAgents,
        onSwitchToAgent,
        repoPath: repoKey,
        selectedAgentId,
        taskId: nextTaskId,
        worktreePath,
      });
    }

    todoStore.stopAutoExecute(repoKey);
    return false;
  }

  const { promptContext, worktreePath: executionWorktreePath } = resolveTaskWorktreePath({
    repoKey,
    task,
    worktreePath,
  });

  if (!executionWorktreePath) {
    todoStore.stopAutoExecute(repoKey);
    return false;
  }

  const taskContext = buildAutoExecutePrompt(task.title, task.description, promptContext);
  const agentChoice = resolveAutoExecuteAgentChoice({
    agents: [...enabledAgents],
    selectedAgentId,
    tasks: [task],
  });
  const agent =
    agentChoice.agent ?? enabledAgents.find((item) => item.isDefault) ?? enabledAgents[0];
  const sessionId = crypto.randomUUID();

  useAgentSessionsStore.getState().addSession({
    id: sessionId,
    sessionId,
    name: `Task: ${task.title}`,
    userRenamed: true,
    agentId: agent.agentId,
    agentCommand: agent.command,
    customPath: agent.customPath,
    customArgs: agent.customArgs,
    initialized: false,
    repoPath: repoKey,
    cwd: executionWorktreePath,
    environment: agent.environment,
    pendingCommand: taskContext,
  });

  todoStore.updateTask(repoKey, taskId, { status: 'in-progress', sessionId });
  todoStore.setCurrentExecution(repoKey, taskId, sessionId);
  onSwitchToAgent?.();

  return true;
}

export function startTodoAutoExecuteQueue({
  enabledAgents,
  onSwitchToAgent,
  repoPath,
  selectedAgentId,
  taskIds,
  worktreePath,
}: StartTodoAutoExecuteQueueOptions): boolean {
  if (taskIds.length === 0 || !hasAgents(enabledAgents)) {
    return false;
  }

  const repoKey = normalizePath(repoPath);
  const [firstTaskId, ...remainingTaskIds] = taskIds;
  useTodoStore.getState().startAutoExecute(repoKey, remainingTaskIds);

  return executeTodoTask({
    enabledAgents,
    onSwitchToAgent,
    repoPath: repoKey,
    selectedAgentId,
    taskId: firstTaskId,
    worktreePath,
  });
}

export function startTodoGlobalAutoExecute({
  dispatchableTasks,
  enabledAgents,
  onSwitchToAgent,
  selectedAgentId,
  worktreePathByRepo,
}: StartTodoGlobalAutoExecuteOptions): number {
  if (dispatchableTasks.length === 0 || !hasAgents(enabledAgents)) {
    return 0;
  }

  const taskIdsByRepo = new Map<string, string[]>();
  for (const task of dispatchableTasks) {
    const repoKey = normalizePath(task.repoPath);
    const taskIds = taskIdsByRepo.get(repoKey) ?? [];
    taskIds.push(task.taskId);
    taskIdsByRepo.set(repoKey, taskIds);
  }

  let startedCount = 0;
  for (const [repoKey, taskIds] of taskIdsByRepo.entries()) {
    const didStart = startTodoAutoExecuteQueue({
      enabledAgents,
      onSwitchToAgent,
      repoPath: repoKey,
      selectedAgentId,
      taskIds,
      worktreePath: getRepoWorktreePath(repoKey, undefined, worktreePathByRepo),
    });

    if (didStart) {
      startedCount += 1;
    }
  }

  return startedCount;
}

export function handleTodoAutoExecuteStop({
  data,
  enabledAgents,
  onSwitchToAgent,
  repoPath,
  selectedAgentId,
  worktreePath,
  worktreePathByRepo,
}: HandleTodoAutoExecuteStopOptions): boolean {
  const uiSessionId = findUISessionId(data.sessionId);
  if (!uiSessionId) {
    return false;
  }

  const match = findMatchingExecution(uiSessionId, repoPath);
  const currentTaskId = match?.autoExecute.currentTaskId;
  if (!match || !currentTaskId) {
    return false;
  }

  if (
    data.source === 'renderer-terminal' &&
    data.taskCompletionStatus !== 'completed' &&
    isClaudeLikeSession(uiSessionId)
  ) {
    return false;
  }

  const todoStore = useTodoStore.getState();
  const { repoKey } = match;

  if (data.taskCompletionStatus === 'completed') {
    todoStore.updateTask(repoKey, currentTaskId, { status: 'done', sessionId: undefined });
    const nextTaskId = todoStore.advanceQueue(repoKey);
    if (nextTaskId && hasAgents(enabledAgents)) {
      executeTodoTask({
        enabledAgents,
        onSwitchToAgent,
        repoPath: repoKey,
        selectedAgentId,
        taskId: nextTaskId,
        worktreePath: getRepoWorktreePath(repoKey, worktreePath, worktreePathByRepo),
      });
    } else {
      todoStore.stopAutoExecute(repoKey);
    }
    return true;
  }

  todoStore.updateTask(repoKey, currentTaskId, { status: 'todo', sessionId: undefined });
  todoStore.stopAutoExecute(repoKey);
  return true;
}
