import type { TaskPriority, TaskStatus, TodoTask } from './types';

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
