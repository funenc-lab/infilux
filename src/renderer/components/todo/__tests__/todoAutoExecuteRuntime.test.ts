/* @vitest-environment jsdom */

import type { AgentStopNotificationData } from '@shared/types/agent';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { useTodoStore } from '@/stores/todo';
import {
  buildAutoExecutePrompt,
  executeTodoTask,
  handleTodoAutoExecuteStop,
  startTodoAutoExecuteQueue,
  startTodoGlobalAutoExecute,
} from '../todoAutoExecuteRuntime';
import type { TodoTask } from '../types';
import type { ResolvedAgent } from '../useEnabledAgents';

const codexAgent: ResolvedAgent = {
  agentId: 'codex',
  command: 'codex',
  environment: 'native',
  isDefault: true,
  name: 'Codex',
};

function createTask(id: string, order: number, overrides: Partial<TodoTask> = {}): TodoTask {
  return {
    id,
    title: `Task ${id}`,
    description: '',
    priority: 'medium',
    status: 'todo',
    createdAt: 1,
    updatedAt: 1,
    order,
    ...overrides,
  };
}

function createStopEvent(sessionId: string): AgentStopNotificationData {
  return {
    sessionId,
    cwd: '/repo-a/worktree',
    source: 'renderer-terminal',
    taskCompletionStatus: 'completed',
  };
}

describe('todoAutoExecuteRuntime', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
    vi.stubGlobal('crypto', {
      randomUUID: vi
        .fn()
        .mockReturnValueOnce('session-a-1')
        .mockReturnValueOnce('session-b-1')
        .mockReturnValueOnce('session-a-2'),
    });
    window.electronAPI = {
      todo: {
        updateTask: vi.fn(async () => undefined),
      },
    } as never;
    useTodoStore.setState({
      tasks: {
        '/repo-a': [
          createTask('a-1', 0, {
            context: { repoPath: '/repo-a', worktreePath: '/repo-a/worktree' },
          }),
          createTask('a-2', 1, {
            context: { repoPath: '/repo-a', worktreePath: '/repo-a/worktree' },
          }),
        ],
        '/repo-b': [
          createTask('b-1', 0, {
            context: { repoPath: '/repo-b', worktreePath: '/repo-b/worktree' },
          }),
        ],
      },
      _loaded: new Set(['/repo-a', '/repo-b']),
      _allProjectsLoaded: true,
      autoExecute: {},
    });
    useAgentSessionsStore.setState({
      sessions: [],
      activeIds: {},
      groupStates: {},
      runtimeStates: {},
      enhancedInputStates: {},
      attachmentTrayStates: {},
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('starts queues across projects and advances the matching repo from stop events', () => {
    expect(
      startTodoAutoExecuteQueue({
        repoPath: '/repo-a',
        taskIds: ['a-1', 'a-2'],
        enabledAgents: [codexAgent],
      })
    ).toBe(true);
    expect(
      startTodoAutoExecuteQueue({
        repoPath: '/repo-b',
        taskIds: ['b-1'],
        enabledAgents: [codexAgent],
      })
    ).toBe(true);

    expect(useAgentSessionsStore.getState().sessions.map((session) => session.id)).toEqual([
      'session-a-1',
      'session-b-1',
    ]);
    expect(useTodoStore.getState().autoExecute).toMatchObject({
      '/repo-a': {
        running: true,
        queue: ['a-2'],
        currentTaskId: 'a-1',
        currentSessionId: 'session-a-1',
      },
      '/repo-b': {
        running: true,
        queue: [],
        currentTaskId: 'b-1',
        currentSessionId: 'session-b-1',
      },
    });

    expect(
      handleTodoAutoExecuteStop({
        data: createStopEvent('session-a-1'),
        enabledAgents: [codexAgent],
      })
    ).toBe(true);

    expect(useTodoStore.getState().tasks['/repo-a']).toMatchObject([
      { id: 'a-1', status: 'done', sessionId: undefined },
      { id: 'a-2', status: 'in-progress', sessionId: 'session-a-2' },
    ]);
    expect(useTodoStore.getState().tasks['/repo-b'][0]).toMatchObject({
      id: 'b-1',
      status: 'in-progress',
      sessionId: 'session-b-1',
    });
    expect(useAgentSessionsStore.getState().sessions.map((session) => session.id)).toEqual([
      'session-a-1',
      'session-b-1',
      'session-a-2',
    ]);
  });

  it('dispatches global ready tasks by repository without mixing queues', () => {
    const result = startTodoGlobalAutoExecute({
      dispatchableTasks: [
        { repoPath: '/repo-a', taskId: 'a-1' },
        { repoPath: '/repo-a', taskId: 'a-2' },
        { repoPath: '/repo-b', taskId: 'b-1' },
      ],
      enabledAgents: [codexAgent],
    });

    expect(result).toMatchObject({
      skippedTasks: [],
      startedCount: 2,
      startedProjects: [
        { repoPath: '/repo-a', taskIds: ['a-1', 'a-2'] },
        { repoPath: '/repo-b', taskIds: ['b-1'] },
      ],
    });
    expect(useAgentSessionsStore.getState().sessions.map((session) => session.id)).toEqual([
      'session-a-1',
      'session-b-1',
    ]);
    expect(useTodoStore.getState().autoExecute).toMatchObject({
      '/repo-a': {
        running: true,
        queue: ['a-2'],
        currentTaskId: 'a-1',
        currentSessionId: 'session-a-1',
      },
      '/repo-b': {
        running: true,
        queue: [],
        currentTaskId: 'b-1',
        currentSessionId: 'session-b-1',
      },
    });
  });

  it('reports skipped global dispatch tasks without overwriting running projects', () => {
    useTodoStore.setState({
      autoExecute: {
        '/repo-a': {
          running: true,
          queue: ['a-2'],
          currentTaskId: 'a-1',
          currentSessionId: 'existing-session',
        },
      },
    });

    const result = startTodoGlobalAutoExecute({
      dispatchableTasks: [
        { repoPath: '/repo-a', taskId: 'a-2' },
        { repoPath: '/repo-b', taskId: 'missing-task' },
        { repoPath: '/repo-c', taskId: 'c-1' },
      ],
      enabledAgents: [codexAgent],
    });

    expect(result).toEqual({
      skippedTasks: [
        { repoPath: '/repo-a', taskId: 'a-2', reason: 'project-running' },
        { repoPath: '/repo-b', taskId: 'missing-task', reason: 'missing-task' },
        { repoPath: '/repo-c', taskId: 'c-1', reason: 'missing-task' },
      ],
      startedCount: 0,
      startedProjects: [],
    });
    expect(useTodoStore.getState().autoExecute['/repo-a']).toMatchObject({
      running: true,
      queue: ['a-2'],
      currentTaskId: 'a-1',
      currentSessionId: 'existing-session',
    });
    expect(useAgentSessionsStore.getState().sessions).toEqual([]);
  });

  it('builds auto-execute prompts with task context and validation rules', () => {
    expect(
      buildAutoExecutePrompt('Fix startup overlay', 'Keep feedback visible', {
        repoPath: '/repo-a',
        worktreePath: '/repo-a/worktree',
      })
    ).toContain('Run the relevant project validation commands before completion');
  });

  it('does not start queues without tasks or enabled agents', () => {
    expect(
      startTodoAutoExecuteQueue({
        repoPath: '/repo-a',
        taskIds: [],
        enabledAgents: [codexAgent],
      })
    ).toBe(false);
    expect(
      startTodoAutoExecuteQueue({
        repoPath: '/repo-a',
        taskIds: ['a-1'],
        enabledAgents: [],
      })
    ).toBe(false);

    expect(
      startTodoGlobalAutoExecute({
        dispatchableTasks: [],
        enabledAgents: [codexAgent],
      })
    ).toEqual({ skippedTasks: [], startedCount: 0, startedProjects: [] });
    expect(
      startTodoGlobalAutoExecute({
        dispatchableTasks: [{ repoPath: '/repo-a', taskId: 'a-1' }],
        enabledAgents: [],
      })
    ).toEqual({
      skippedTasks: [{ repoPath: '/repo-a', taskId: 'a-1', reason: 'no-enabled-agents' }],
      startedCount: 0,
      startedProjects: [],
    });
  });

  it('advances past missing queued tasks and stops when worktree context is unavailable', () => {
    expect(
      startTodoAutoExecuteQueue({
        repoPath: '/repo-a',
        taskIds: ['missing-task', 'a-1'],
        enabledAgents: [codexAgent],
      })
    ).toBe(true);
    expect(useTodoStore.getState().autoExecute['/repo-a']).toMatchObject({
      running: true,
      currentTaskId: 'a-1',
      currentSessionId: 'session-a-1',
    });

    useTodoStore.setState({
      tasks: {
        '/repo-a': [createTask('a-no-context', 0)],
      },
      autoExecute: {},
    });

    expect(
      executeTodoTask({
        repoPath: '/repo-a',
        taskId: 'a-no-context',
        enabledAgents: [codexAgent],
      })
    ).toBe(false);
    expect(useTodoStore.getState().autoExecute['/repo-a']?.running).toBe(false);
  });

  it('reports missing worktrees during global dispatch without starting sessions', () => {
    useTodoStore.setState({
      tasks: {
        '/repo-a': [createTask('a-no-context', 0)],
      },
      autoExecute: {},
    });

    expect(
      startTodoGlobalAutoExecute({
        dispatchableTasks: [{ repoPath: '/repo-a', taskId: 'a-no-context' }],
        enabledAgents: [codexAgent],
      })
    ).toEqual({
      skippedTasks: [{ repoPath: '/repo-a', taskId: 'a-no-context', reason: 'missing-worktree' }],
      startedCount: 0,
      startedProjects: [],
    });
    expect(useAgentSessionsStore.getState().sessions).toEqual([]);
  });

  it('handles stop events that do not complete the current task', () => {
    startTodoAutoExecuteQueue({
      repoPath: '/repo-a',
      taskIds: ['a-1'],
      enabledAgents: [codexAgent],
    });

    expect(
      handleTodoAutoExecuteStop({
        data: {
          ...createStopEvent('unknown-provider-session'),
          taskCompletionStatus: 'unknown',
        },
        enabledAgents: [codexAgent],
      })
    ).toBe(false);

    expect(
      handleTodoAutoExecuteStop({
        data: {
          ...createStopEvent('session-a-1'),
          taskCompletionStatus: 'unknown',
        },
        enabledAgents: [codexAgent],
      })
    ).toBe(true);
    expect(useTodoStore.getState().tasks['/repo-a'][0]).toMatchObject({
      id: 'a-1',
      status: 'todo',
      sessionId: undefined,
    });
    expect(useTodoStore.getState().autoExecute['/repo-a']?.running).toBe(false);
  });

  it('waits for explicit completion from renderer stop events for Claude-like sessions', () => {
    const claudeAgent: ResolvedAgent = {
      agentId: 'claude',
      command: 'claude',
      environment: 'native',
      isDefault: true,
      name: 'Claude',
    };

    startTodoAutoExecuteQueue({
      repoPath: '/repo-a',
      taskIds: ['a-1'],
      enabledAgents: [claudeAgent],
    });

    expect(
      handleTodoAutoExecuteStop({
        data: {
          ...createStopEvent('session-a-1'),
          taskCompletionStatus: 'unknown',
        },
        enabledAgents: [claudeAgent],
      })
    ).toBe(false);
    expect(useTodoStore.getState().tasks['/repo-a'][0]).toMatchObject({
      id: 'a-1',
      status: 'in-progress',
      sessionId: 'session-a-1',
    });
  });
});
