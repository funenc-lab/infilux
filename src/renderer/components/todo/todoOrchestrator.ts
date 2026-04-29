import { type AutoExecuteAgentChoice, resolveAutoExecuteAgentChoice } from './agentCapabilities';
import { getTodoTaskApprovalState, getTodoTaskDependencyIds } from './todoTaskContext';
import type { TodoTask } from './types';
import type { ResolvedAgent } from './useEnabledAgents';

export type TodoOrchestrationStatus = 'idle' | 'blocked' | 'ready' | 'running';
export type TodoDependencyIssueReason = 'Missing dependency' | 'Waiting for dependency';

export interface TodoTaskDependency {
  taskId: string;
  dependsOnTaskId: string;
}

export interface TodoOrchestrationDependencyIssue {
  taskId: string;
  dependsOnTaskId: string;
  reason: TodoDependencyIssueReason;
}

export interface TodoOrchestrationProgress {
  totalTaskCount: number;
  completedTaskCount: number;
  runningTaskCount: number;
  pendingTaskCount: number;
  blockedTaskCount: number;
  progressPercent: number;
}

export interface TodoOrchestrationTaskPlan {
  task: TodoTask;
  sequence: number;
  agent?: ResolvedAgent;
  assignmentMode: AutoExecuteAgentChoice['mode'];
  assignmentReason: string;
  dependencyIds: string[];
  approvalRequired: boolean;
  approvalPending: boolean;
  blockedByTaskIds: string[];
  blockedByMissingTaskIds: string[];
  blockers: string[];
  canRun: boolean;
}

export interface TodoOrchestrationPlan {
  status: TodoOrchestrationStatus;
  currentTask?: TodoOrchestrationTaskPlan;
  queuedTasks: TodoOrchestrationTaskPlan[];
  readyTasks: TodoOrchestrationTaskPlan[];
  dispatchableTasks: TodoOrchestrationTaskPlan[];
  blockedTasks: TodoOrchestrationTaskPlan[];
  missingTaskIds: string[];
  dependencyIssues: TodoOrchestrationDependencyIssue[];
  progress: TodoOrchestrationProgress;
  blockers: string[];
  assignedAgentCount: number;
  unassignedTaskCount: number;
  maxParallelTasks: number;
  parallelSlotCount: number;
  canStart: boolean;
  canSkipCurrent: boolean;
  canRemoveQueuedTasks: boolean;
}

interface BuildTodoOrchestrationPlanOptions {
  allTasks?: readonly TodoTask[];
  candidateTasks: readonly TodoTask[];
  dependencies?: readonly TodoTaskDependency[];
  enabledAgents: readonly ResolvedAgent[];
  maxParallelTasks?: number;
  selectedAgentId?: string;
  worktreePath?: string;
  running: boolean;
  currentTaskId?: string | null;
  queue?: readonly string[];
}

interface TaskDependencyState {
  dependencyIds: string[];
  blockedByTaskIds: string[];
  blockedByMissingTaskIds: string[];
}

function normalizeMaxParallelTasks(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 1;
  }
  return Math.max(1, Math.floor(value));
}

function hasTaskWorktreeContext(task: TodoTask): boolean {
  return typeof task.context?.worktreePath === 'string' && task.context.worktreePath.trim() !== '';
}

export function getTodoTaskDependenciesFromContext(
  tasks: readonly TodoTask[]
): TodoTaskDependency[] {
  return tasks.flatMap((task) =>
    getTodoTaskDependencyIds(task.context, task.id).map((dependsOnTaskId) => ({
      taskId: task.id,
      dependsOnTaskId,
    }))
  );
}

function buildDependencyState({
  dependencies,
  task,
  taskById,
}: {
  dependencies: readonly TodoTaskDependency[];
  task: TodoTask;
  taskById: Map<string, TodoTask>;
}): TaskDependencyState {
  const dependencyIds: string[] = [];
  const blockedByTaskIds: string[] = [];
  const blockedByMissingTaskIds: string[] = [];

  for (const dependency of dependencies) {
    if (dependency.taskId !== task.id) {
      continue;
    }

    dependencyIds.push(dependency.dependsOnTaskId);

    const dependencyTask = taskById.get(dependency.dependsOnTaskId);
    if (!dependencyTask) {
      blockedByMissingTaskIds.push(dependency.dependsOnTaskId);
      continue;
    }

    if (dependencyTask.status !== 'done') {
      blockedByTaskIds.push(dependency.dependsOnTaskId);
    }
  }

  return {
    dependencyIds,
    blockedByTaskIds,
    blockedByMissingTaskIds,
  };
}

function buildPlanTask({
  agents,
  dependencies,
  selectedAgentId,
  sequence,
  task,
  taskById,
}: {
  agents: ResolvedAgent[];
  dependencies: readonly TodoTaskDependency[];
  selectedAgentId?: string;
  sequence: number;
  task: TodoTask;
  taskById: Map<string, TodoTask>;
}): TodoOrchestrationTaskPlan {
  const choice = resolveAutoExecuteAgentChoice({
    agents,
    selectedAgentId,
    tasks: [task],
  });
  const approvalState = getTodoTaskApprovalState(task.context);
  const dependencyState = buildDependencyState({
    dependencies,
    task,
    taskById,
  });
  const blockers = [
    ...(choice.agent ? [] : [choice.reason]),
    ...(approvalState === 'pending' ? ['Waiting for approval'] : []),
    ...dependencyState.blockedByTaskIds.map(() => 'Waiting for dependency'),
    ...dependencyState.blockedByMissingTaskIds.map(() => 'Missing dependency'),
  ];

  return {
    task,
    sequence,
    agent: choice.agent,
    assignmentMode: choice.mode,
    assignmentReason: choice.reason,
    dependencyIds: dependencyState.dependencyIds,
    approvalRequired: approvalState !== 'none',
    approvalPending: approvalState === 'pending',
    blockedByTaskIds: dependencyState.blockedByTaskIds,
    blockedByMissingTaskIds: dependencyState.blockedByMissingTaskIds,
    blockers,
    canRun: blockers.length === 0,
  };
}

function buildProgress({
  allTasks,
  blockedTaskCount,
}: {
  allTasks: readonly TodoTask[];
  blockedTaskCount: number;
}): TodoOrchestrationProgress {
  const completedTaskCount = allTasks.filter((task) => task.status === 'done').length;
  const runningTaskCount = allTasks.filter((task) => task.status === 'in-progress').length;
  const totalTaskCount = allTasks.length;
  const pendingTaskCount = Math.max(
    0,
    totalTaskCount - completedTaskCount - runningTaskCount - blockedTaskCount
  );

  return {
    totalTaskCount,
    completedTaskCount,
    runningTaskCount,
    pendingTaskCount,
    blockedTaskCount,
    progressPercent:
      totalTaskCount === 0 ? 0 : Math.round((completedTaskCount / totalTaskCount) * 100),
  };
}

export function buildTodoOrchestrationPlan({
  allTasks,
  candidateTasks,
  currentTaskId,
  dependencies,
  enabledAgents,
  maxParallelTasks,
  queue = [],
  running,
  selectedAgentId,
  worktreePath,
}: BuildTodoOrchestrationPlanOptions): TodoOrchestrationPlan {
  const agents = [...enabledAgents];
  const tasksForContext = allTasks ?? candidateTasks;
  const taskById = new Map(tasksForContext.map((task) => [task.id, task]));
  const taskDependencies = dependencies ?? getTodoTaskDependenciesFromContext(tasksForContext);
  const blockers: string[] = [];
  const normalizedMaxParallelTasks = normalizeMaxParallelTasks(maxParallelTasks);
  const hasExecutableWorktreeContext =
    candidateTasks.length > 0 && candidateTasks.every(hasTaskWorktreeContext);

  if (!worktreePath && !hasExecutableWorktreeContext) {
    blockers.push('No worktree selected');
  }

  if (agents.length === 0) {
    blockers.push('No enabled agents');
  }

  const missingTaskIds = running
    ? [currentTaskId, ...queue].filter(
        (taskId): taskId is string => typeof taskId === 'string' && !taskById.has(taskId)
      )
    : [];

  const plannedTasks = running
    ? []
    : candidateTasks.map((task, index) =>
        buildPlanTask({
          agents,
          dependencies: taskDependencies,
          selectedAgentId,
          sequence: index + 1,
          task,
          taskById,
        })
      );
  const readyTasks = plannedTasks.filter((taskPlan) => taskPlan.canRun);
  const blockedTasks = plannedTasks.filter((taskPlan) => !taskPlan.canRun);
  const dispatchableTasks = readyTasks.slice(0, normalizedMaxParallelTasks);

  const currentTask = running && currentTaskId ? taskById.get(currentTaskId) : undefined;
  const currentTaskPlan = currentTask
    ? buildPlanTask({
        agents,
        dependencies: taskDependencies,
        selectedAgentId,
        sequence: 1,
        task: currentTask,
        taskById,
      })
    : undefined;

  const queuedTasks = running
    ? queue
        .map((taskId, index) => {
          const task = taskById.get(taskId);
          if (!task) return null;
          return buildPlanTask({
            agents,
            dependencies: taskDependencies,
            selectedAgentId,
            sequence: index + 2,
            task,
            taskById,
          });
        })
        .filter((taskPlan): taskPlan is TodoOrchestrationTaskPlan => taskPlan !== null)
    : [];

  const visibleTasks = running
    ? [currentTaskPlan, ...queuedTasks].filter((taskPlan): taskPlan is TodoOrchestrationTaskPlan =>
        Boolean(taskPlan)
      )
    : plannedTasks;

  const dependencyIssues = [...plannedTasks, currentTaskPlan, ...queuedTasks]
    .filter((taskPlan): taskPlan is TodoOrchestrationTaskPlan => Boolean(taskPlan))
    .flatMap((taskPlan) => [
      ...taskPlan.blockedByTaskIds.map((dependsOnTaskId) => ({
        taskId: taskPlan.task.id,
        dependsOnTaskId,
        reason: 'Waiting for dependency' as const,
      })),
      ...taskPlan.blockedByMissingTaskIds.map((dependsOnTaskId) => ({
        taskId: taskPlan.task.id,
        dependsOnTaskId,
        reason: 'Missing dependency' as const,
      })),
    ]);

  const hasApprovalBlockedTasks = blockedTasks.some((taskPlan) => taskPlan.approvalPending);
  const hasDependencyBlockedTasks = blockedTasks.some(
    (taskPlan) =>
      taskPlan.blockedByTaskIds.length > 0 || taskPlan.blockedByMissingTaskIds.length > 0
  );

  if (!running && blockers.length === 0 && readyTasks.length === 0 && hasApprovalBlockedTasks) {
    blockers.push('Waiting for approval');
  } else if (
    !running &&
    blockers.length === 0 &&
    readyTasks.length === 0 &&
    hasDependencyBlockedTasks
  ) {
    blockers.push('Waiting for dependencies');
  } else if (!running && blockers.length === 0 && readyTasks.length === 0) {
    blockers.push('No ready tasks');
  }

  const assignedAgentIds = new Set(
    visibleTasks.map((taskPlan) => taskPlan.agent?.agentId).filter(Boolean)
  );
  const unassignedTaskCount = visibleTasks.filter((taskPlan) => !taskPlan.agent).length;
  const progress = buildProgress({
    allTasks: tasksForContext,
    blockedTaskCount: blockedTasks.length,
  });
  const status: TodoOrchestrationStatus = running
    ? 'running'
    : blockers.length > 0
      ? 'blocked'
      : visibleTasks.length > 0
        ? 'ready'
        : 'idle';

  return {
    status,
    currentTask: currentTaskPlan,
    queuedTasks,
    readyTasks,
    dispatchableTasks,
    blockedTasks,
    missingTaskIds,
    dependencyIssues,
    progress,
    blockers,
    assignedAgentCount: assignedAgentIds.size,
    unassignedTaskCount,
    maxParallelTasks: normalizedMaxParallelTasks,
    parallelSlotCount: dispatchableTasks.length,
    canStart: status === 'ready',
    canSkipCurrent: running && Boolean(currentTaskPlan),
    canRemoveQueuedTasks: running && queuedTasks.length > 0,
  };
}

export function getExecutableTodoTaskIds(plan: TodoOrchestrationPlan): string[] {
  if (!plan.canStart) {
    return [];
  }

  return plan.readyTasks.filter((taskPlan) => taskPlan.canRun).map((taskPlan) => taskPlan.task.id);
}
