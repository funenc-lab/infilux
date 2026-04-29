import { getTodoTaskApprovalState, getTodoTaskDependencyIds } from './todoTaskContext';
import type { AutoExecuteState, TaskPriority, TaskStatus, TodoTask } from './types';

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To Do',
  'in-progress': 'In Progress',
  done: 'Done',
};

export interface TodoStatusMeta {
  label: string;
  chipClassName: string;
}

export const TODO_STATUS_META: Record<TaskStatus, TodoStatusMeta> = {
  todo: {
    label: STATUS_LABELS.todo,
    chipClassName: 'control-chip',
  },
  'in-progress': {
    label: STATUS_LABELS['in-progress'],
    chipClassName: 'control-chip control-chip-live',
  },
  done: {
    label: STATUS_LABELS.done,
    chipClassName: 'control-chip control-chip-done',
  },
};

export interface TodoPriorityMeta {
  label: string;
  dotClassName: string;
  chipClassName: string;
}

export const TODO_PRIORITY_META: Record<TaskPriority, TodoPriorityMeta> = {
  low: {
    label: 'Low',
    dotClassName: 'bg-info',
    chipClassName: 'border-info/24 bg-info/8 text-info',
  },
  medium: {
    label: 'Medium',
    dotClassName: 'bg-warning',
    chipClassName: 'border-warning/28 bg-warning/10 text-warning',
  },
  high: {
    label: 'High',
    dotClassName: 'bg-destructive',
    chipClassName: 'border-destructive/28 bg-destructive/10 text-destructive',
  },
};

export interface TodoBoardSummary {
  totalTaskCount: number;
  openTaskCount: number;
  completionPercent: number;
  statusCounts: Record<TaskStatus, number>;
}

export type TodoDecisionCenterProjectStatus = 'blocked' | 'done' | 'idle' | 'ready' | 'running';

export interface TodoDecisionCenterProjectInput {
  repoPath: string;
  tasks: readonly TodoTask[];
  autoExecute?: AutoExecuteState;
  isCurrent?: boolean;
}

export interface TodoDecisionCenterProjectSummary extends TodoBoardSummary {
  repoPath: string;
  repoName: string;
  isCurrent: boolean;
  status: TodoDecisionCenterProjectStatus;
  readyTaskCount: number;
  blockedTaskCount: number;
  approvalPendingTaskCount: number;
  dependencyBlockedTaskCount: number;
  runningTaskCount: number;
  autoExecuteRunning: boolean;
}

export interface TodoDecisionCenterSummary {
  projectCount: number;
  totalTaskCount: number;
  openTaskCount: number;
  readyTaskCount: number;
  blockedTaskCount: number;
  approvalPendingTaskCount: number;
  dependencyBlockedTaskCount: number;
  runningTaskCount: number;
  runningProjectCount: number;
  execution: TodoDecisionCenterExecutionSummary;
  projects: TodoDecisionCenterProjectSummary[];
}

export type TodoDecisionCenterNextAction =
  | 'dispatch-ready'
  | 'idle'
  | 'monitor-running'
  | 'request-approval'
  | 'resolve-dependencies';

export type TodoDecisionCenterInterventionReason = 'approval' | 'dependency';

export interface TodoDecisionCenterDispatchableTask {
  repoPath: string;
  repoName: string;
  isCurrentProject: boolean;
  taskId: string;
  title: string;
  priority: TaskPriority;
  agentId: string;
  agentLabel: string;
}

export interface TodoDecisionCenterInterventionTask {
  repoPath: string;
  repoName: string;
  isCurrentProject: boolean;
  taskId: string;
  title: string;
  reasons: TodoDecisionCenterInterventionReason[];
  dependencyTaskIds: string[];
}

export interface TodoDecisionCenterRunningTask {
  repoPath: string;
  repoName: string;
  isCurrentProject: boolean;
  taskId: string;
  title: string;
  agentId: string;
  agentLabel: string;
  sessionId?: string;
}

export interface TodoDecisionCenterAgentLoad {
  agentId: string;
  label: string;
  projectCount: number;
  readyTaskCount: number;
  runningTaskCount: number;
}

export interface TodoDecisionCenterExecutionSummary {
  nextAction: TodoDecisionCenterNextAction;
  dispatchableTasks: TodoDecisionCenterDispatchableTask[];
  interventionTasks: TodoDecisionCenterInterventionTask[];
  runningTasks: TodoDecisionCenterRunningTask[];
  agentLoads: TodoDecisionCenterAgentLoad[];
}

export type AutoExecuteDisabledReason = 'worktree' | 'agents' | 'tasks';
export type TodoBoardPrimaryAction = 'auto-execute' | 'generate' | 'new-task';
export type TodoBoardHeaderStatId = 'tasks' | 'completion';
export type TodoBoardHeaderStatTone = 'neutral' | 'done';
export type TaskRelativeTimeKey =
  | 'Just now'
  | '{{count}}m ago'
  | '{{count}}h ago'
  | '{{count}}d ago';

export interface TodoBoardHeaderStat {
  id: TodoBoardHeaderStatId;
  labelKey: string;
  labelParams?: Record<string, number>;
  compactValue?: string;
  tone: TodoBoardHeaderStatTone;
}

export interface TaskRelativeTimeLabel {
  key: TaskRelativeTimeKey;
  params?: Record<string, number>;
}

export function getTodoBoardPrimaryAction({
  canAutoExecute,
  todoTaskCount,
  totalTaskCount,
}: {
  canAutoExecute: boolean;
  todoTaskCount: number;
  totalTaskCount: number;
}): TodoBoardPrimaryAction {
  if (totalTaskCount === 0) return 'generate';
  if (todoTaskCount > 0 && canAutoExecute) return 'auto-execute';
  return 'new-task';
}

export function groupTasksByStatus(tasks: readonly TodoTask[]): Record<TaskStatus, TodoTask[]> {
  const grouped: Record<TaskStatus, TodoTask[]> = {
    todo: [],
    'in-progress': [],
    done: [],
  };

  for (const task of tasks) {
    grouped[task.status]?.push(task);
  }

  for (const tasksInStatus of Object.values(grouped)) {
    tasksInStatus.sort((a, b) => a.order - b.order);
  }

  return grouped;
}

export function buildTodoBoardSummary(tasks: readonly TodoTask[]): TodoBoardSummary {
  const statusCounts: Record<TaskStatus, number> = {
    todo: 0,
    'in-progress': 0,
    done: 0,
  };

  for (const task of tasks) {
    statusCounts[task.status] += 1;
  }

  const totalTaskCount = tasks.length;
  const completionPercent =
    totalTaskCount === 0 ? 0 : Math.round((statusCounts.done / totalTaskCount) * 100);

  return {
    totalTaskCount,
    openTaskCount: totalTaskCount - statusCounts.done,
    completionPercent,
    statusCounts,
  };
}

function getRepoDisplayName(repoPath: string): string {
  const normalized = repoPath.trim().replace(/[\\/]+$/g, '');
  if (!normalized) return 'Repository';
  return normalized.split(/[\\/]/).filter(Boolean).pop() ?? normalized;
}

function hasBlockedDependencies(task: TodoTask, taskById: ReadonlyMap<string, TodoTask>): boolean {
  return getTodoTaskDependencyIds(task.context, task.id).some(
    (dependencyTaskId) => taskById.get(dependencyTaskId)?.status !== 'done'
  );
}

function getBlockedDependencyIds(
  task: TodoTask,
  taskById: ReadonlyMap<string, TodoTask>
): string[] {
  return getTodoTaskDependencyIds(task.context, task.id).filter(
    (dependencyTaskId) => taskById.get(dependencyTaskId)?.status !== 'done'
  );
}

function getAgentAssignment(task: TodoTask): { agentId: string; agentLabel: string } {
  const agentId = task.agentId?.trim() || 'auto';
  return {
    agentId,
    agentLabel: agentId === 'auto' ? 'Auto Select' : agentId,
  };
}

function getTodoDecisionCenterProjectStatus(
  project: Pick<
    TodoDecisionCenterProjectSummary,
    'autoExecuteRunning' | 'blockedTaskCount' | 'openTaskCount' | 'readyTaskCount'
  >
): TodoDecisionCenterProjectStatus {
  if (project.autoExecuteRunning) return 'running';
  if (project.blockedTaskCount > 0) return 'blocked';
  if (project.readyTaskCount > 0) return 'ready';
  if (project.openTaskCount > 0) return 'idle';
  return 'done';
}

function getTodoDecisionCenterProjectRank(project: TodoDecisionCenterProjectSummary): number {
  if (project.isCurrent) return -1;
  if (project.status === 'running') return 0;
  if (project.status === 'blocked') return 1;
  if (project.status === 'ready') return 2;
  if (project.status === 'idle') return 3;
  return 4;
}

function buildTodoDecisionCenterProjectSummary({
  autoExecute,
  isCurrent = false,
  repoPath,
  tasks,
}: TodoDecisionCenterProjectInput): TodoDecisionCenterProjectSummary {
  const boardSummary = buildTodoBoardSummary(tasks);
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  let readyTaskCount = 0;
  let blockedTaskCount = 0;
  let approvalPendingTaskCount = 0;
  let dependencyBlockedTaskCount = 0;
  let runningTaskCount = 0;

  for (const task of tasks) {
    if (task.status === 'in-progress') {
      runningTaskCount += 1;
      continue;
    }

    if (task.status !== 'todo') {
      continue;
    }

    const approvalPending = getTodoTaskApprovalState(task.context) === 'pending';
    const dependencyBlocked = hasBlockedDependencies(task, taskById);

    if (approvalPending) {
      approvalPendingTaskCount += 1;
    }
    if (dependencyBlocked) {
      dependencyBlockedTaskCount += 1;
    }
    if (approvalPending || dependencyBlocked) {
      blockedTaskCount += 1;
    } else {
      readyTaskCount += 1;
    }
  }

  const autoExecuteRunning = autoExecute?.running ?? false;
  const partialSummary = {
    ...boardSummary,
    repoPath,
    repoName: getRepoDisplayName(repoPath),
    isCurrent,
    readyTaskCount,
    blockedTaskCount,
    approvalPendingTaskCount,
    dependencyBlockedTaskCount,
    runningTaskCount,
    autoExecuteRunning,
  };

  return {
    ...partialSummary,
    status: getTodoDecisionCenterProjectStatus(partialSummary),
  };
}

const PRIORITY_RANK: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function buildTodoDecisionCenterExecutionSummary(
  projects: readonly TodoDecisionCenterProjectInput[],
  projectSummaries: readonly TodoDecisionCenterProjectSummary[]
): TodoDecisionCenterExecutionSummary {
  const summaryByRepoPath = new Map(projectSummaries.map((project) => [project.repoPath, project]));
  const dispatchableTasks: TodoDecisionCenterDispatchableTask[] = [];
  const interventionTasks: TodoDecisionCenterInterventionTask[] = [];
  const runningTasks: TodoDecisionCenterRunningTask[] = [];
  const agentLoadById = new Map<
    string,
    {
      label: string;
      readyTaskCount: number;
      runningTaskCount: number;
      repoPaths: Set<string>;
    }
  >();

  function recordAgentLoad(task: TodoTask, repoPath: string, kind: 'ready' | 'running'): void {
    const { agentId, agentLabel } = getAgentAssignment(task);
    const current = agentLoadById.get(agentId) ?? {
      label: agentLabel,
      readyTaskCount: 0,
      runningTaskCount: 0,
      repoPaths: new Set<string>(),
    };

    if (kind === 'ready') {
      current.readyTaskCount += 1;
    } else {
      current.runningTaskCount += 1;
    }
    current.repoPaths.add(repoPath);
    agentLoadById.set(agentId, current);
  }

  for (const projectInput of projects) {
    const projectSummary = summaryByRepoPath.get(projectInput.repoPath);
    const repoName = projectSummary?.repoName ?? getRepoDisplayName(projectInput.repoPath);
    const isCurrentProject = projectSummary?.isCurrent ?? projectInput.isCurrent ?? false;
    const taskById = new Map(projectInput.tasks.map((task) => [task.id, task]));

    for (const task of projectInput.tasks) {
      if (task.status === 'in-progress') {
        const { agentId, agentLabel } = getAgentAssignment(task);
        const sessionId =
          task.sessionId ??
          (projectInput.autoExecute?.currentTaskId === task.id
            ? (projectInput.autoExecute.currentSessionId ?? undefined)
            : undefined);
        runningTasks.push({
          repoPath: projectInput.repoPath,
          repoName,
          isCurrentProject,
          taskId: task.id,
          title: task.title,
          agentId,
          agentLabel,
          ...(sessionId ? { sessionId } : {}),
        });
        recordAgentLoad(task, projectInput.repoPath, 'running');
        continue;
      }

      if (task.status !== 'todo') {
        continue;
      }

      const approvalPending = getTodoTaskApprovalState(task.context) === 'pending';
      const dependencyTaskIds = getBlockedDependencyIds(task, taskById);

      if (approvalPending || dependencyTaskIds.length > 0) {
        interventionTasks.push({
          repoPath: projectInput.repoPath,
          repoName,
          isCurrentProject,
          taskId: task.id,
          title: task.title,
          reasons: [
            ...(approvalPending ? (['approval'] as const) : []),
            ...(dependencyTaskIds.length > 0 ? (['dependency'] as const) : []),
          ],
          dependencyTaskIds,
        });
        continue;
      }

      const { agentId, agentLabel } = getAgentAssignment(task);
      dispatchableTasks.push({
        repoPath: projectInput.repoPath,
        repoName,
        isCurrentProject,
        taskId: task.id,
        title: task.title,
        priority: task.priority,
        agentId,
        agentLabel,
      });
      recordAgentLoad(task, projectInput.repoPath, 'ready');
    }
  }

  dispatchableTasks.sort((a, b) => {
    const priorityDelta = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (priorityDelta !== 0) return priorityDelta;
    if (a.isCurrentProject !== b.isCurrentProject) return a.isCurrentProject ? -1 : 1;
    const repoDelta = a.repoName.localeCompare(b.repoName);
    if (repoDelta !== 0) return repoDelta;
    return a.title.localeCompare(b.title);
  });

  interventionTasks.sort((a, b) => {
    const approvalDelta =
      Number(b.reasons.includes('approval')) - Number(a.reasons.includes('approval'));
    if (approvalDelta !== 0) return approvalDelta;
    if (a.isCurrentProject !== b.isCurrentProject) return a.isCurrentProject ? -1 : 1;
    const repoDelta = a.repoName.localeCompare(b.repoName);
    if (repoDelta !== 0) return repoDelta;
    return a.title.localeCompare(b.title);
  });

  runningTasks.sort((a, b) => {
    if (a.isCurrentProject !== b.isCurrentProject) return a.isCurrentProject ? -1 : 1;
    const repoDelta = a.repoName.localeCompare(b.repoName);
    if (repoDelta !== 0) return repoDelta;
    return a.title.localeCompare(b.title);
  });

  const agentLoads = Array.from(agentLoadById.entries())
    .map(([agentId, load]) => ({
      agentId,
      label: load.label,
      projectCount: load.repoPaths.size,
      readyTaskCount: load.readyTaskCount,
      runningTaskCount: load.runningTaskCount,
    }))
    .sort((a, b) => {
      if (a.runningTaskCount !== b.runningTaskCount) return b.runningTaskCount - a.runningTaskCount;
      if (a.readyTaskCount !== b.readyTaskCount) return b.readyTaskCount - a.readyTaskCount;
      return a.label.localeCompare(b.label);
    });

  const runningTaskCount = agentLoads.reduce((sum, load) => sum + load.runningTaskCount, 0);
  const approvalTaskCount = interventionTasks.filter((task) =>
    task.reasons.includes('approval')
  ).length;
  const dependencyTaskCount = interventionTasks.filter((task) =>
    task.reasons.includes('dependency')
  ).length;

  return {
    nextAction:
      runningTaskCount > 0
        ? 'monitor-running'
        : dispatchableTasks.length > 0
          ? 'dispatch-ready'
          : approvalTaskCount > 0
            ? 'request-approval'
            : dependencyTaskCount > 0
              ? 'resolve-dependencies'
              : 'idle',
    dispatchableTasks,
    interventionTasks,
    runningTasks,
    agentLoads,
  };
}

export function buildTodoDecisionCenterSummary(
  projects: readonly TodoDecisionCenterProjectInput[]
): TodoDecisionCenterSummary {
  const projectSummaries = projects.map(buildTodoDecisionCenterProjectSummary).sort((a, b) => {
    const rankDelta = getTodoDecisionCenterProjectRank(a) - getTodoDecisionCenterProjectRank(b);
    if (rankDelta !== 0) return rankDelta;
    if (a.openTaskCount !== b.openTaskCount) return b.openTaskCount - a.openTaskCount;
    return a.repoName.localeCompare(b.repoName);
  });

  return {
    projectCount: projectSummaries.length,
    totalTaskCount: projectSummaries.reduce((sum, project) => sum + project.totalTaskCount, 0),
    openTaskCount: projectSummaries.reduce((sum, project) => sum + project.openTaskCount, 0),
    readyTaskCount: projectSummaries.reduce((sum, project) => sum + project.readyTaskCount, 0),
    blockedTaskCount: projectSummaries.reduce((sum, project) => sum + project.blockedTaskCount, 0),
    approvalPendingTaskCount: projectSummaries.reduce(
      (sum, project) => sum + project.approvalPendingTaskCount,
      0
    ),
    dependencyBlockedTaskCount: projectSummaries.reduce(
      (sum, project) => sum + project.dependencyBlockedTaskCount,
      0
    ),
    runningTaskCount: projectSummaries.reduce((sum, project) => sum + project.runningTaskCount, 0),
    runningProjectCount: projectSummaries.filter((project) => project.autoExecuteRunning).length,
    execution: buildTodoDecisionCenterExecutionSummary(projects, projectSummaries),
    projects: projectSummaries,
  };
}

export function getTodoBoardHeaderStats(summary: TodoBoardSummary): TodoBoardHeaderStat[] {
  if (summary.totalTaskCount === 0) {
    return [
      {
        id: 'tasks',
        labelKey: 'No tasks',
        tone: 'neutral',
      },
    ];
  }

  return [
    {
      id: 'tasks',
      labelKey: '{{count}} tasks',
      labelParams: { count: summary.totalTaskCount },
      tone: 'neutral',
    },
    {
      id: 'completion',
      labelKey: 'Completion {{percent}}%',
      labelParams: { percent: summary.completionPercent },
      compactValue: `${summary.completionPercent}%`,
      tone: 'done',
    },
  ];
}

export function getTaskRelativeTimeLabel(
  timestamp: number,
  now = Date.now()
): TaskRelativeTimeLabel {
  const diff = Math.max(0, now - timestamp);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return { key: 'Just now' };
  if (minutes < 60) return { key: '{{count}}m ago', params: { count: minutes } };

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { key: '{{count}}h ago', params: { count: hours } };

  const days = Math.floor(hours / 24);
  return { key: '{{count}}d ago', params: { count: days } };
}

export function getAutoExecuteDisabledReason({
  enabledAgentCount,
  hasExecutableWorktreeContext = false,
  todoTaskCount,
  worktreePath,
}: {
  enabledAgentCount: number;
  hasExecutableWorktreeContext?: boolean;
  todoTaskCount: number;
  worktreePath?: string;
}): AutoExecuteDisabledReason | null {
  if (!worktreePath && !hasExecutableWorktreeContext) return 'worktree';
  if (enabledAgentCount === 0) return 'agents';
  if (todoTaskCount === 0) return 'tasks';
  return null;
}
