/* @vitest-environment jsdom */

import type { AgentStopNotificationData } from '@shared/types/agent';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { useTodoStore } from '@/stores/todo';
import {
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
    const startedCount = startTodoGlobalAutoExecute({
      dispatchableTasks: [
        { repoPath: '/repo-a', taskId: 'a-1' },
        { repoPath: '/repo-a', taskId: 'a-2' },
        { repoPath: '/repo-b', taskId: 'b-1' },
      ],
      enabledAgents: [codexAgent],
    });

    expect(startedCount).toBe(2);
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
});
