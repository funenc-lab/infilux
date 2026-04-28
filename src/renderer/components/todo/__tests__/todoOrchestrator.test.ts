import { describe, expect, it } from 'vitest';
import { AUTO_EXECUTE_AGENT_AUTO_VALUE } from '../agentCapabilities';
import { buildTodoOrchestrationPlan, getExecutableTodoTaskIds } from '../todoOrchestrator';
import type { TodoTask } from '../types';
import type { ResolvedAgent } from '../useEnabledAgents';

const codexAgent: ResolvedAgent = {
  agentId: 'codex',
  command: 'codex',
  environment: 'native',
  isDefault: true,
  name: 'Codex',
};

const geminiAgent: ResolvedAgent = {
  agentId: 'gemini',
  command: 'gemini',
  environment: 'native',
  isDefault: false,
  name: 'Gemini',
};

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

describe('todoOrchestrator', () => {
  it('builds a ready plan with task-level agent assignment and agent coverage', () => {
    const plan = buildTodoOrchestrationPlan({
      candidateTasks: [
        createTask({ id: 'task-1', description: 'Implement and test the workflow' }),
        createTask({ id: 'task-2', agentId: 'gemini', description: 'Research docs' }),
      ],
      enabledAgents: [codexAgent, geminiAgent],
      running: false,
      selectedAgentId: AUTO_EXECUTE_AGENT_AUTO_VALUE,
      worktreePath: '/repo/worktree',
    });

    expect(plan.status).toBe('ready');
    expect(plan.canStart).toBe(true);
    expect(plan.readyTasks.map((taskPlan) => taskPlan.task.id)).toEqual(['task-1', 'task-2']);
    expect(plan.readyTasks[1]).toMatchObject({
      agent: { agentId: 'gemini' },
      assignmentMode: 'task',
    });
    expect(plan.dispatchableTasks.map((taskPlan) => taskPlan.task.id)).toEqual(['task-1']);
    expect(plan.parallelSlotCount).toBe(1);
    expect(plan.assignedAgentCount).toBe(2);
    expect(plan.unassignedTaskCount).toBe(0);
  });

  it('reports blockers when the worktree or agents are unavailable', () => {
    const plan = buildTodoOrchestrationPlan({
      candidateTasks: [createTask({ id: 'task-1' })],
      enabledAgents: [],
      running: false,
    });

    expect(plan.status).toBe('blocked');
    expect(plan.canStart).toBe(false);
    expect(plan.blockers).toEqual(['No worktree selected', 'No enabled agents']);
    expect(plan.blockedTasks.map((taskPlan) => taskPlan.task.id)).toEqual(['task-1']);
    expect(plan.unassignedTaskCount).toBe(1);
  });

  it('treats task-bound worktree context as executable when no active worktree is selected', () => {
    const plan = buildTodoOrchestrationPlan({
      candidateTasks: [
        createTask({
          id: 'task-1',
          context: {
            repoPath: '/repo',
            worktreePath: '/repo/worktree',
          },
        }),
      ],
      enabledAgents: [codexAgent],
      running: false,
    });

    expect(plan.status).toBe('ready');
    expect(plan.blockers).toEqual([]);
    expect(plan.canStart).toBe(true);
  });

  it('builds a running plan from the current task and queued task ids', () => {
    const plan = buildTodoOrchestrationPlan({
      candidateTasks: [
        createTask({ id: 'task-1', status: 'in-progress', sessionId: 'session-1' }),
        createTask({ id: 'task-2' }),
      ],
      currentTaskId: 'task-1',
      enabledAgents: [codexAgent],
      queue: ['task-2'],
      running: true,
      worktreePath: '/repo/worktree',
    });

    expect(plan.status).toBe('running');
    expect(plan.currentTask?.task.id).toBe('task-1');
    expect(plan.queuedTasks.map((taskPlan) => taskPlan.task.id)).toEqual(['task-2']);
    expect(plan.canSkipCurrent).toBe(true);
    expect(plan.canRemoveQueuedTasks).toBe(true);
  });

  it('tracks missing queued tasks without blocking visible running work', () => {
    const plan = buildTodoOrchestrationPlan({
      candidateTasks: [createTask({ id: 'task-1', status: 'in-progress' })],
      currentTaskId: 'task-1',
      enabledAgents: [codexAgent],
      queue: ['deleted-task'],
      running: true,
      worktreePath: '/repo/worktree',
    });

    expect(plan.status).toBe('running');
    expect(plan.missingTaskIds).toEqual(['deleted-task']);
    expect(plan.queuedTasks).toEqual([]);
  });

  it('separates dependency-blocked tasks from dispatchable ready tasks', () => {
    const plan = buildTodoOrchestrationPlan({
      allTasks: [
        createTask({ id: 'setup', status: 'done' }),
        createTask({ id: 'api', status: 'todo' }),
        createTask({ id: 'ui', status: 'todo' }),
        createTask({ id: 'release', status: 'todo' }),
      ],
      candidateTasks: [
        createTask({ id: 'api', status: 'todo' }),
        createTask({ id: 'ui', status: 'todo' }),
        createTask({ id: 'release', status: 'todo' }),
      ],
      dependencies: [
        { taskId: 'api', dependsOnTaskId: 'setup' },
        { taskId: 'release', dependsOnTaskId: 'api' },
      ],
      enabledAgents: [codexAgent, geminiAgent],
      maxParallelTasks: 2,
      running: false,
      worktreePath: '/repo/worktree',
    });

    expect(plan.status).toBe('ready');
    expect(plan.readyTasks.map((taskPlan) => taskPlan.task.id)).toEqual(['api', 'ui']);
    expect(plan.dispatchableTasks.map((taskPlan) => taskPlan.task.id)).toEqual(['api', 'ui']);
    expect(plan.blockedTasks.map((taskPlan) => taskPlan.task.id)).toEqual(['release']);
    expect(plan.blockedTasks[0].blockedByTaskIds).toEqual(['api']);
    expect(plan.dependencyIssues).toEqual([
      {
        taskId: 'release',
        dependsOnTaskId: 'api',
        reason: 'Waiting for dependency',
      },
    ]);
    expect(plan.parallelSlotCount).toBe(2);
    expect(plan.progress).toEqual({
      totalTaskCount: 4,
      completedTaskCount: 1,
      runningTaskCount: 0,
      pendingTaskCount: 2,
      blockedTaskCount: 1,
      progressPercent: 25,
    });
  });

  it('blocks the plan when every candidate task is waiting on dependencies', () => {
    const plan = buildTodoOrchestrationPlan({
      allTasks: [
        createTask({ id: 'api', status: 'todo' }),
        createTask({ id: 'release', status: 'todo' }),
      ],
      candidateTasks: [createTask({ id: 'release', status: 'todo' })],
      dependencies: [{ taskId: 'release', dependsOnTaskId: 'api' }],
      enabledAgents: [codexAgent],
      maxParallelTasks: 4,
      running: false,
      worktreePath: '/repo/worktree',
    });

    expect(plan.status).toBe('blocked');
    expect(plan.canStart).toBe(false);
    expect(plan.blockers).toEqual(['Waiting for dependencies']);
    expect(plan.readyTasks).toEqual([]);
    expect(plan.dispatchableTasks).toEqual([]);
    expect(plan.parallelSlotCount).toBe(0);
  });

  it('returns only ready task ids for execution start', () => {
    const plan = buildTodoOrchestrationPlan({
      allTasks: [
        createTask({ id: 'api', status: 'todo' }),
        createTask({ id: 'ui', status: 'todo' }),
        createTask({ id: 'release', status: 'todo' }),
      ],
      candidateTasks: [
        createTask({ id: 'api', status: 'todo' }),
        createTask({ id: 'ui', status: 'todo' }),
        createTask({ id: 'release', status: 'todo' }),
      ],
      dependencies: [{ taskId: 'release', dependsOnTaskId: 'api' }],
      enabledAgents: [codexAgent],
      maxParallelTasks: 2,
      running: false,
      worktreePath: '/repo/worktree',
    });

    expect(getExecutableTodoTaskIds(plan)).toEqual(['api', 'ui']);
  });

  it('returns no executable task ids when the plan is blocked', () => {
    const plan = buildTodoOrchestrationPlan({
      candidateTasks: [createTask({ id: 'task-1' })],
      enabledAgents: [],
      running: false,
    });

    expect(getExecutableTodoTaskIds(plan)).toEqual([]);
  });

  it('reports missing dependency ids as dependency issues', () => {
    const plan = buildTodoOrchestrationPlan({
      candidateTasks: [createTask({ id: 'release', status: 'todo' })],
      dependencies: [{ taskId: 'release', dependsOnTaskId: 'missing-task' }],
      enabledAgents: [codexAgent],
      running: false,
      worktreePath: '/repo/worktree',
    });

    expect(plan.status).toBe('blocked');
    expect(plan.blockedTasks[0].blockedByMissingTaskIds).toEqual(['missing-task']);
    expect(plan.dependencyIssues).toEqual([
      {
        taskId: 'release',
        dependsOnTaskId: 'missing-task',
        reason: 'Missing dependency',
      },
    ]);
  });
});
