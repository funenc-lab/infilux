import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const localSessionManagerTestDoubles = vi.hoisted(() => {
  const getSharedLocalStorageSnapshot = vi.fn();
  const markLegacyLocalStorageMigrated = vi.fn();
  const readSharedTodoTasks = vi.fn();
  const updateSharedSessionState = vi.fn();
  const writeSharedLocalStorageSnapshot = vi.fn();

  function reset() {
    getSharedLocalStorageSnapshot.mockReset();
    markLegacyLocalStorageMigrated.mockReset();
    readSharedTodoTasks.mockReset();
    updateSharedSessionState.mockReset();
    writeSharedLocalStorageSnapshot.mockReset();
  }

  return {
    getSharedLocalStorageSnapshot,
    markLegacyLocalStorageMigrated,
    readSharedTodoTasks,
    updateSharedSessionState,
    writeSharedLocalStorageSnapshot,
    reset,
  };
});

vi.mock('../SharedSessionState', () => ({
  getSharedLocalStorageSnapshot: localSessionManagerTestDoubles.getSharedLocalStorageSnapshot,
  markLegacyLocalStorageMigrated: localSessionManagerTestDoubles.markLegacyLocalStorageMigrated,
  readSharedTodoTasks: localSessionManagerTestDoubles.readSharedTodoTasks,
  updateSharedSessionState: localSessionManagerTestDoubles.updateSharedSessionState,
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
    };
    localSessionManagerTestDoubles.readSharedTodoTasks.mockReturnValue([baseTask]);

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

    const { localSessionManager } = await import('../LocalSessionManager');

    expect(localSessionManager.getTodoTasks(repoPath)).toEqual([baseTask]);
    expect(localSessionManager.addTodoTask(repoPath, baseTask)).toEqual(baseTask);

    localSessionManager.updateTodoTask(repoPath, 'task-1', {
      title: 'Updated title',
      status: 'doing',
    });
    localSessionManager.deleteTodoTask(repoPath, 'task-2');
    localSessionManager.moveTodoTask(repoPath, 'task-1', 'done', 9);
    localSessionManager.reorderTodoTasks(repoPath, 'todo', ['task-1', 'task-3']);

    const addCall = localSessionManagerTestDoubles.updateSharedSessionState.mock.results[0]?.value;
    const updateCall =
      localSessionManagerTestDoubles.updateSharedSessionState.mock.results[1]?.value;
    const deleteCall =
      localSessionManagerTestDoubles.updateSharedSessionState.mock.results[2]?.value;
    const moveCall = localSessionManagerTestDoubles.updateSharedSessionState.mock.results[3]?.value;
    const reorderCall =
      localSessionManagerTestDoubles.updateSharedSessionState.mock.results[4]?.value;

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
});
