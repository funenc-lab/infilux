import { describe, expect, it } from 'vitest';
import {
  buildAiCenterSummary,
  buildTodoBoardSummary,
  getAutoExecuteDisabledReason,
  getTaskRelativeTimeLabel,
  getTodoBoardHeaderStats,
  getTodoBoardPrimaryAction,
  groupTasksByStatus,
  TODO_PRIORITY_META,
  TODO_STATUS_META,
} from '../todoViewModel';
import type { TodoTask } from '../types';

function createTask(overrides: Partial<TodoTask> & Pick<TodoTask, 'id'>): TodoTask {
  return {
    id: overrides.id,
    title: overrides.title ?? `Task ${overrides.id}`,
    description: overrides.description ?? '',
    priority: overrides.priority ?? 'medium',
    status: overrides.status ?? 'todo',
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
    order: overrides.order ?? 0,
    ...(overrides.agentId ? { agentId: overrides.agentId } : {}),
    ...(overrides.sessionId ? { sessionId: overrides.sessionId } : {}),
    ...(overrides.context ? { context: overrides.context } : {}),
  };
}

describe('todoViewModel', () => {
  it('groups tasks by status and sorts each column by order', () => {
    const grouped = groupTasksByStatus([
      createTask({ id: 'done-1', status: 'done', order: 2 }),
      createTask({ id: 'todo-2', status: 'todo', order: 2 }),
      createTask({ id: 'todo-1', status: 'todo', order: 1 }),
      createTask({ id: 'doing-1', status: 'in-progress', order: 0 }),
    ]);

    expect(grouped.todo.map((task) => task.id)).toEqual(['todo-1', 'todo-2']);
    expect(grouped['in-progress'].map((task) => task.id)).toEqual(['doing-1']);
    expect(grouped.done.map((task) => task.id)).toEqual(['done-1']);
  });

  it('builds board summary counts and completion percentage', () => {
    const summary = buildTodoBoardSummary([
      createTask({ id: 'todo-1', status: 'todo' }),
      createTask({ id: 'todo-2', status: 'todo' }),
      createTask({ id: 'doing-1', status: 'in-progress' }),
      createTask({ id: 'done-1', status: 'done' }),
    ]);

    expect(summary).toEqual({
      totalTaskCount: 4,
      openTaskCount: 3,
      completionPercent: 25,
      statusCounts: {
        todo: 2,
        'in-progress': 1,
        done: 1,
      },
    });
    expect(buildTodoBoardSummary([]).completionPercent).toBe(0);
  });

  it('keeps board header stats compact and leaves status counts to column headers', () => {
    expect(getTodoBoardHeaderStats(buildTodoBoardSummary([]))).toEqual([
      {
        id: 'tasks',
        labelKey: 'No tasks',
        tone: 'neutral',
      },
    ]);

    expect(
      getTodoBoardHeaderStats(
        buildTodoBoardSummary([
          createTask({ id: 'todo-1', status: 'todo' }),
          createTask({ id: 'todo-2', status: 'todo' }),
          createTask({ id: 'done-1', status: 'done' }),
        ])
      )
    ).toEqual([
      {
        id: 'tasks',
        labelKey: '{{count}} tasks',
        labelParams: { count: 3 },
        tone: 'neutral',
      },
      {
        id: 'completion',
        labelKey: 'Completion {{percent}}%',
        labelParams: { percent: 33 },
        compactValue: '33%',
        tone: 'done',
      },
    ]);
  });

  it('builds translatable relative task update time labels with future timestamps clamped to now', () => {
    const now = 1_000_000;

    expect(getTaskRelativeTimeLabel(now - 30_000, now)).toEqual({ key: 'Just now' });
    expect(getTaskRelativeTimeLabel(now - 59 * 60_000, now)).toEqual({
      key: '{{count}}m ago',
      params: { count: 59 },
    });
    expect(getTaskRelativeTimeLabel(now - 2 * 60 * 60_000, now)).toEqual({
      key: '{{count}}h ago',
      params: { count: 2 },
    });
    expect(getTaskRelativeTimeLabel(now - 3 * 24 * 60 * 60_000, now)).toEqual({
      key: '{{count}}d ago',
      params: { count: 3 },
    });
    expect(getTaskRelativeTimeLabel(now + 10_000, now)).toEqual({ key: 'Just now' });
  });

  it('resolves auto-execute disabled reason by the next required action', () => {
    expect(
      getAutoExecuteDisabledReason({
        enabledAgentCount: 1,
        todoTaskCount: 1,
      })
    ).toBe('worktree');

    expect(
      getAutoExecuteDisabledReason({
        enabledAgentCount: 1,
        todoTaskCount: 1,
        hasExecutableWorktreeContext: true,
      })
    ).toBeNull();

    expect(
      getAutoExecuteDisabledReason({
        enabledAgentCount: 0,
        todoTaskCount: 1,
        worktreePath: '/repo/worktree',
      })
    ).toBe('agents');

    expect(
      getAutoExecuteDisabledReason({
        enabledAgentCount: 1,
        todoTaskCount: 0,
        worktreePath: '/repo/worktree',
      })
    ).toBe('tasks');

    expect(
      getAutoExecuteDisabledReason({
        enabledAgentCount: 1,
        todoTaskCount: 1,
        worktreePath: '/repo/worktree',
      })
    ).toBeNull();
  });

  it('chooses the board primary action from the current task state', () => {
    expect(
      getTodoBoardPrimaryAction({
        canAutoExecute: false,
        todoTaskCount: 0,
        totalTaskCount: 0,
      })
    ).toBe('generate');

    expect(
      getTodoBoardPrimaryAction({
        canAutoExecute: true,
        todoTaskCount: 2,
        totalTaskCount: 3,
      })
    ).toBe('auto-execute');

    expect(
      getTodoBoardPrimaryAction({
        canAutoExecute: false,
        todoTaskCount: 2,
        totalTaskCount: 3,
      })
    ).toBe('new-task');

    expect(
      getTodoBoardPrimaryAction({
        canAutoExecute: true,
        todoTaskCount: 0,
        totalTaskCount: 3,
      })
    ).toBe('new-task');
  });

  it('keeps status and priority metadata complete for the board view', () => {
    expect(Object.keys(TODO_STATUS_META)).toEqual(['todo', 'in-progress', 'done']);
    expect(Object.keys(TODO_PRIORITY_META)).toEqual(['low', 'medium', 'high']);
  });

  it('builds a global decision center summary across loaded repositories', () => {
    const summary = buildAiCenterSummary([
      {
        repoPath: '/repo/current',
        isCurrent: true,
        autoExecute: {
          running: true,
          queue: ['current-ready'],
          currentTaskId: 'running',
          currentSessionId: 'session-1',
        },
        tasks: [
          createTask({ id: 'finished', status: 'done' }),
          createTask({ id: 'running', status: 'in-progress' }),
          createTask({
            id: 'current-ready',
            status: 'todo',
            priority: 'high',
            agentId: 'codex',
            context: { dependencyTaskIds: ['finished'] },
          }),
          createTask({
            id: 'needs-approval',
            status: 'todo',
            context: { executionGate: { requiresApproval: true } },
          }),
        ],
      },
      {
        repoPath: '/repo/other',
        autoExecute: {
          running: false,
          queue: [],
          currentTaskId: null,
          currentSessionId: null,
        },
        tasks: [
          createTask({ id: 'other-done', status: 'done' }),
          createTask({ id: 'other-ready', status: 'todo', agentId: 'gemini' }),
          createTask({
            id: 'blocked-dependency',
            status: 'todo',
            context: { dependencyTaskIds: ['missing-task'] },
          }),
        ],
      },
    ]);

    expect(summary).toMatchObject({
      projectCount: 2,
      totalTaskCount: 7,
      openTaskCount: 5,
      readyTaskCount: 2,
      blockedTaskCount: 2,
      approvalPendingTaskCount: 1,
      dependencyBlockedTaskCount: 1,
      runningTaskCount: 1,
      runningProjectCount: 1,
    });
    expect(summary.execution.nextAction).toBe('dispatch-ready');
    expect(summary.execution.dispatchableTasks.map((task) => task.taskId)).toEqual(['other-ready']);
    expect(summary.execution.deferredQueueTasks.map((task) => task.taskId)).toEqual([
      'current-ready',
    ]);
    expect(summary.execution.interventionTasks.map((task) => task.taskId)).toEqual([
      'needs-approval',
      'blocked-dependency',
    ]);
    expect(summary.execution.runningTasks.map((task) => task.taskId)).toEqual(['running']);
    expect(summary.execution.runningTasks[0]).toMatchObject({
      repoPath: '/repo/current',
      repoName: 'current',
      title: 'Task running',
      agentId: 'auto',
      agentLabel: 'Auto Select',
      sessionId: 'session-1',
    });
    expect(summary.execution.agentLoads).toEqual([
      {
        agentId: 'auto',
        label: 'Auto Select',
        projectCount: 1,
        readyTaskCount: 0,
        runningTaskCount: 1,
      },
      {
        agentId: 'codex',
        label: 'codex',
        projectCount: 1,
        readyTaskCount: 1,
        runningTaskCount: 0,
      },
      {
        agentId: 'gemini',
        label: 'gemini',
        projectCount: 1,
        readyTaskCount: 1,
        runningTaskCount: 0,
      },
    ]);
    expect(summary.projects.map((project) => project.repoPath)).toEqual([
      '/repo/current',
      '/repo/other',
    ]);
    expect(summary.projects[0]).toMatchObject({
      repoName: 'current',
      isCurrent: true,
      status: 'running',
      readyTaskCount: 1,
      blockedTaskCount: 1,
      approvalPendingTaskCount: 1,
      dependencyBlockedTaskCount: 0,
      autoExecuteRunning: true,
    });
    expect(summary.projects[1]).toMatchObject({
      repoName: 'other',
      status: 'blocked',
      readyTaskCount: 1,
      blockedTaskCount: 1,
      dependencyBlockedTaskCount: 1,
      autoExecuteRunning: false,
    });
  });

  it('monitors running projects when all ready tasks are deferred behind active queues', () => {
    const summary = buildAiCenterSummary([
      {
        repoPath: '/repo/current',
        autoExecute: {
          running: true,
          queue: ['queued-follow-up'],
          currentTaskId: 'running',
          currentSessionId: 'session-1',
        },
        tasks: [
          createTask({ id: 'running', status: 'in-progress' }),
          createTask({
            id: 'queued-follow-up',
            status: 'todo',
            priority: 'high',
            agentId: 'codex',
          }),
        ],
      },
    ]);

    expect(summary.execution.nextAction).toBe('monitor-running');
    expect(summary.execution.dispatchableTasks).toEqual([]);
    expect(summary.execution.deferredQueueTasks.map((task) => task.taskId)).toEqual([
      'queued-follow-up',
    ]);
  });
});
