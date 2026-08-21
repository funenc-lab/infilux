import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const localSessionManagerTestDoubles = vi.hoisted(() => {
  const getSharedLocalStorageSnapshot = vi.fn();
  const markLegacyLocalStorageMigrated = vi.fn();
  const readSharedTodoProjects = vi.fn();
  const readSharedTodoTasks = vi.fn();
  const updateSharedSessionState = vi.fn();
  const updateSharedSessionStateDeferred = vi.fn();
  const writeSharedLocalStorageSnapshot = vi.fn();

  function reset() {
    getSharedLocalStorageSnapshot.mockReset();
    markLegacyLocalStorageMigrated.mockReset();
    readSharedTodoProjects.mockReset();
    readSharedTodoTasks.mockReset();
    updateSharedSessionState.mockReset();
    updateSharedSessionStateDeferred.mockReset();
    writeSharedLocalStorageSnapshot.mockReset();
  }

  return {
    getSharedLocalStorageSnapshot,
    markLegacyLocalStorageMigrated,
    readSharedTodoProjects,
    readSharedTodoTasks,
    updateSharedSessionState,
    updateSharedSessionStateDeferred,
    writeSharedLocalStorageSnapshot,
    reset,
  };
});

vi.mock('../SharedSessionState', () => ({
  getSharedLocalStorageSnapshot: localSessionManagerTestDoubles.getSharedLocalStorageSnapshot,
  markLegacyLocalStorageMigrated: localSessionManagerTestDoubles.markLegacyLocalStorageMigrated,
  readSharedTodoProjects: localSessionManagerTestDoubles.readSharedTodoProjects,
  readSharedTodoTasks: localSessionManagerTestDoubles.readSharedTodoTasks,
  updateSharedSessionState: localSessionManagerTestDoubles.updateSharedSessionState,
  updateSharedSessionStateDeferred: localSessionManagerTestDoubles.updateSharedSessionStateDeferred,
  writeSharedLocalStorageSnapshot: localSessionManagerTestDoubles.writeSharedLocalStorageSnapshot,
}));

describe('LocalSessionManager', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    localSessionManagerTestDoubles.reset();
    vi.spyOn(Date, 'now').mockReturnValue(123456);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('proxies local storage and legacy migration operations', async () => {
    localSessionManagerTestDoubles.getSharedLocalStorageSnapshot.mockReturnValue({
      theme: 'dark',
    });

    const { localSessionManager } = await import('../LocalSessionManager');

    expect(localSessionManager.getSessionState()).toEqual({
      localStorage: {
        theme: 'dark',
      },
    });

    localSessionManager.syncLocalStorage({ locale: 'en' });
    localSessionManager.importLegacyLocalStorage({ locale: 'zh-CN' });

    expect(localSessionManagerTestDoubles.writeSharedLocalStorageSnapshot).toHaveBeenNthCalledWith(
      1,
      { locale: 'en' }
    );
    expect(localSessionManagerTestDoubles.writeSharedLocalStorageSnapshot).toHaveBeenNthCalledWith(
      2,
      { locale: 'zh-CN' }
    );
    expect(localSessionManagerTestDoubles.markLegacyLocalStorageMigrated).toHaveBeenCalledTimes(1);
  });

  it('reads todo tasks and mutates todo session state consistently', async () => {
    const repoPath = '/repo';
    const baseTask = {
      id: 'task-1',
      title: 'Task',
      description: 'Description',
      priority: 'high',
      status: 'todo',
      order: 0,
      createdAt: 1,
      updatedAt: 1,
      context: {
        repoPath,
        worktreePath: '/repo/worktree',
        dependencyTaskIds: ['task-0'],
        executionGate: {
          requiresApproval: true,
        },
        files: [{ path: 'src/main/index.ts', label: 'index.ts' }],
        directories: [{ path: 'src/main', label: 'main' }],
      },
    };
    localSessionManagerTestDoubles.readSharedTodoTasks.mockReturnValue([baseTask]);
    localSessionManagerTestDoubles.readSharedTodoProjects.mockReturnValue([
      {
        repoPath,
        tasks: [baseTask],
      },
    ]);

    const currentState = {
      updatedAt: 1,
      todos: {
        [repoPath]: [
          baseTask,
          {
            ...baseTask,
            id: 'task-2',
            status: 'doing',
            order: 5,
          },
        ],
      },
    };

    localSessionManagerTestDoubles.updateSharedSessionState.mockImplementation((updater) =>
      updater(currentState)
    );
    localSessionManagerTestDoubles.updateSharedSessionStateDeferred.mockImplementation((updater) =>
      updater(currentState)
    );

    const { localSessionManager } = await import('../LocalSessionManager');

    expect(localSessionManager.getTodoTasks(repoPath)).toEqual([baseTask]);
    expect(localSessionManager.getAllTodoProjects()).toEqual([
      {
        repoPath,
        tasks: [baseTask],
      },
    ]);
    expect(localSessionManager.addTodoTask(repoPath, baseTask)).toEqual(baseTask);

    localSessionManager.updateTodoTask(repoPath, 'task-1', {
      title: 'Updated title',
      status: 'doing',
      context: {
        repoPath,
        worktreePath: '/repo/other-worktree',
        dependencyTaskIds: ['task-0', 'task-0', ' '],
        executionGate: {
          approvedAt: 123,
          requiresApproval: true,
        },
        files: [{ path: 'src/renderer/App.tsx' }],
        directories: [{ path: 'src/renderer/components' }],
      },
    });
    localSessionManager.deleteTodoTask(repoPath, 'task-2');
    localSessionManager.moveTodoTask(repoPath, 'task-1', 'done', 9);
    localSessionManager.reorderTodoTasks(repoPath, 'todo', ['task-1', 'task-3']);

    const addCall =
      localSessionManagerTestDoubles.updateSharedSessionStateDeferred.mock.results[0]?.value;
    const updateCall =
      localSessionManagerTestDoubles.updateSharedSessionStateDeferred.mock.results[1]?.value;
    const deleteCall =
      localSessionManagerTestDoubles.updateSharedSessionStateDeferred.mock.results[2]?.value;
    const moveCall =
      localSessionManagerTestDoubles.updateSharedSessionStateDeferred.mock.results[3]?.value;
    const reorderCall =
      localSessionManagerTestDoubles.updateSharedSessionStateDeferred.mock.results[4]?.value;

    expect(addCall).toEqual({
      ...currentState,
      updatedAt: 123456,
      todos: {
        [repoPath]: [...currentState.todos[repoPath], baseTask],
      },
    });
    expect(updateCall.todos[repoPath][0]).toEqual({
      ...baseTask,
      title: 'Updated title',
      status: 'doing',
      updatedAt: 123456,
      context: {
        repoPath,
        worktreePath: '/repo/other-worktree',
        dependencyTaskIds: ['task-0'],
        executionGate: {
          approvedAt: 123,
          requiresApproval: true,
        },
        files: [{ path: 'src/renderer/App.tsx' }],
        directories: [{ path: 'src/renderer/components' }],
      },
    });
    expect(deleteCall.todos[repoPath]).toEqual([currentState.todos[repoPath][0]]);
    expect(moveCall.todos[repoPath][0]).toEqual({
      ...baseTask,
      status: 'done',
      order: 9,
      updatedAt: 123456,
    });
    expect(reorderCall.todos[repoPath][0]).toEqual({
      ...baseTask,
      order: 0,
      updatedAt: 123456,
    });
    expect(reorderCall.todos[repoPath][1]).toEqual(currentState.todos[repoPath][1]);
  });

  it('defers disk persistence for interactive todo mutations', async () => {
    const repoPath = '/repo';
    const task = {
      id: 'task-1',
      title: 'Task',
      description: '',
      priority: 'medium',
      status: 'todo',
      order: 0,
      createdAt: 1,
      updatedAt: 1,
    };
    localSessionManagerTestDoubles.updateSharedSessionStateDeferred.mockImplementation((updater) =>
      updater({
        version: 2,
        updatedAt: 1,
        settingsData: {},
        localStorage: {},
        todos: {
          [repoPath]: [],
        },
      })
    );

    const { localSessionManager } = await import('../LocalSessionManager');
    localSessionManager.addTodoTask(repoPath, task);
    localSessionManager.updateTodoTask(repoPath, task.id, { status: 'done' });
    localSessionManager.deleteTodoTask(repoPath, task.id);

    expect(localSessionManagerTestDoubles.updateSharedSessionStateDeferred).toHaveBeenCalledTimes(
      3
    );
    expect(localSessionManagerTestDoubles.updateSharedSessionState).not.toHaveBeenCalled();
  });

  it('migrates legacy localStorage todo boards into shared todo state', async () => {
    const repoPath = '/repo';
    const existingTask = {
      id: 'task-1',
      title: 'Existing task',
      description: '',
      priority: 'medium',
      status: 'todo',
      order: 0,
      createdAt: 1,
      updatedAt: 1,
    };
    const currentState = {
      updatedAt: 1,
      todos: {
        [repoPath]: [existingTask],
      },
    };

    localSessionManagerTestDoubles.updateSharedSessionState.mockImplementation((updater) =>
      updater(currentState)
    );

    const { localSessionManager } = await import('../LocalSessionManager');
    const result = localSessionManager.migrateTodoBoardsFromLocalStorage(
      JSON.stringify({
        [repoPath]: {
          tasks: [
            {
              id: 'task-1',
              title: 'Duplicate ignored',
            },
            {
              id: 'task-2',
              title: 'Migrated task',
              description: 'Body',
              priority: 'urgent',
              status: 'doing',
              createdAt: 10,
              updatedAt: 11,
              order: 4,
              sessionId: 'session-1',
              agentId: 'gemini',
              context: {
                repoPath,
                worktreePath: '/repo/worktree',
                dependencyTaskIds: ['task-1', 'task-1'],
                executionGate: {
                  approvedAt: Number.NaN,
                  requiresApproval: true,
                },
                files: [{ path: 'src/main/index.ts', label: 'index.ts' }],
                directories: [{ path: 'src/main', label: 'main' }],
              },
            },
            {
              id: '',
              title: 'Invalid task',
            },
          ],
        },
      })
    );

    const migrationCall =
      localSessionManagerTestDoubles.updateSharedSessionState.mock.results[0]?.value;

    expect(result).toEqual({ migratedTaskCount: 1 });
    expect(migrationCall).toEqual({
      ...currentState,
      updatedAt: 123456,
      todos: {
        [repoPath]: [
          existingTask,
          {
            id: 'task-2',
            title: 'Migrated task',
            description: 'Body',
            priority: 'medium',
            status: 'in-progress',
            order: 4,
            createdAt: 10,
            updatedAt: 11,
            sessionId: 'session-1',
            agentId: 'gemini',
            context: {
              repoPath,
              worktreePath: '/repo/worktree',
              dependencyTaskIds: ['task-1'],
              executionGate: {
                requiresApproval: true,
              },
              files: [{ path: 'src/main/index.ts', label: 'index.ts' }],
              directories: [{ path: 'src/main', label: 'main' }],
            },
          },
        ],
      },
    });
  });
});
