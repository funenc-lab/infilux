import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '@/App/storage';
import type { TaskStatus, TodoTask } from '@/components/todo/types';

function createLocalStorageMock(initial?: Record<string, string>) {
  const data = new Map(Object.entries(initial ?? {}));
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      data.delete(key);
    }),
    clear: vi.fn(() => {
      data.clear();
    }),
  };
}

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
    ...(overrides.sessionId ? { sessionId: overrides.sessionId } : {}),
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

async function loadTodoStore(options?: {
  storedValue?: string;
  migrateImpl?: (saved: string) => Promise<void>;
  getTasksImpl?: (repoPath: string) => Promise<TodoTask[]>;
  addTaskImpl?: (repoPath: string, task: TodoTask) => Promise<void>;
  updateTaskImpl?: (repoPath: string, taskId: string, updates: unknown) => Promise<void>;
  deleteTaskImpl?: (repoPath: string, taskId: string) => Promise<void>;
  moveTaskImpl?: (
    repoPath: string,
    taskId: string,
    status: TaskStatus,
    order: number
  ) => Promise<void>;
  reorderTasksImpl?: (repoPath: string, status: TaskStatus, orderedIds: string[]) => Promise<void>;
  platform?: string;
  randomId?: string;
}) {
  vi.resetModules();

  const localStorageMock = createLocalStorageMock(
    options?.storedValue
      ? {
          [STORAGE_KEYS.TODO_BOARDS]: options.storedValue,
        }
      : undefined
  );

  const todoApi = {
    migrate: vi.fn(options?.migrateImpl ?? (async () => {})),
    getTasks: vi.fn(options?.getTasksImpl ?? (async () => [])),
    addTask: vi.fn(options?.addTaskImpl ?? (async () => {})),
    updateTask: vi.fn(options?.updateTaskImpl ?? (async () => {})),
    deleteTask: vi.fn(options?.deleteTaskImpl ?? (async () => {})),
    moveTask: vi.fn(options?.moveTaskImpl ?? (async () => {})),
    reorderTasks: vi.fn(options?.reorderTasksImpl ?? (async () => {})),
  };

  vi.stubGlobal('localStorage', localStorageMock);
  vi.stubGlobal('navigator', { platform: options?.platform ?? 'MacIntel' });
  vi.stubGlobal('crypto', {
    randomUUID: vi.fn(() => options?.randomId ?? 'generated-task-id'),
  });
  vi.stubGlobal('window', {
    electronAPI: {
      todo: todoApi,
    },
  });

  const module = await import('../todo');
  await flushPromises();

  return {
    ...module,
    localStorageMock,
    todoApi,
  };
}

describe('todo store', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('migrates local storage on module load and exposes stable selector fallbacks', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const env = await loadTodoStore({
      storedValue: '{"repo":[]}',
    });

    expect(env.todoApi.migrate).toHaveBeenCalledWith('{"repo":[]}');
    expect(env.localStorageMock.removeItem).toHaveBeenCalledWith(STORAGE_KEYS.TODO_BOARDS);
    expect(logSpy).toHaveBeenCalledWith('[TodoStore] Migrated localStorage data to SQLite');

    const state = env.useTodoStore.getState();
    const firstMissingTasks = env.selectTasks(state, '/Repo/Missing');
    const secondMissingTasks = env.selectTasks(state, '/repo/missing-2');

    expect(firstMissingTasks).toEqual([]);
    expect(firstMissingTasks).toBe(secondMissingTasks);
    expect(env.selectAutoExecute(state, '/Repo/Missing')).toBe(env.INITIAL_AUTO_EXECUTE);
  });

  it('skips migration when storage is empty and reports migration failures', async () => {
    const emptyEnv = await loadTodoStore();
    expect(emptyEnv.todoApi.migrate).not.toHaveBeenCalled();

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failingEnv = await loadTodoStore({
      storedValue: '{"repo":[]}',
      migrateImpl: async () => {
        throw new Error('migration failed');
      },
    });

    expect(failingEnv.todoApi.migrate).toHaveBeenCalledWith('{"repo":[]}');
    expect(failingEnv.localStorageMock.removeItem).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('[TodoStore] Migration failed:', expect.any(Error));
  });

  it('loads tasks once per normalized repo key and reports load failures', async () => {
    const tasks = [createTask({ id: 'task-1', title: 'Loaded task' })];
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const env = await loadTodoStore({
      getTasksImpl: async (repoPath: string) => {
        if (repoPath === '/repo/failing') {
          throw new Error('load failed');
        }
        return tasks;
      },
    });
    const store = env.useTodoStore.getState();

    await store.loadTasks('/Repo/Main/');
    await store.loadTasks('/repo/main');
    await store.loadTasks('/repo/failing');

    expect(env.todoApi.getTasks).toHaveBeenNthCalledWith(1, '/repo/main');
    expect(env.todoApi.getTasks).toHaveBeenNthCalledWith(2, '/repo/failing');
    expect(env.useTodoStore.getState().tasks['/repo/main']).toEqual(tasks);
    expect(env.useTodoStore.getState()._loaded.has('/repo/main')).toBe(true);
    expect(env.useTodoStore.getState()._loaded.has('/repo/failing')).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(
      '[TodoStore] Failed to load tasks for',
      '/repo/failing',
      expect.any(Error)
    );
  });

  it('optimistically mutates tasks and reports IPC persistence failures', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const env = await loadTodoStore({
      randomId: 'task-new',
      addTaskImpl: async () => {
        throw new Error('add failed');
      },
      updateTaskImpl: async () => {
        throw new Error('update failed');
      },
      deleteTaskImpl: async () => {
        throw new Error('delete failed');
      },
      moveTaskImpl: async () => {
        throw new Error('move failed');
      },
      reorderTasksImpl: async () => {
        throw new Error('reorder failed');
      },
    });

    env.useTodoStore.setState({
      tasks: {
        '/repo/main': [
          createTask({ id: 'todo-0', status: 'todo', order: 0 }),
          createTask({ id: 'todo-1', status: 'todo', order: 1 }),
          createTask({ id: 'doing-0', status: 'in-progress', order: 0 }),
        ],
      },
      _loaded: new Set<string>(),
      autoExecute: {},
    });

    const store = env.useTodoStore.getState();
    const newTask = store.addTask('/Repo/Main', {
      title: 'New task',
      description: 'Persist later',
      priority: 'high',
      status: 'todo',
    });

    expect(newTask).toMatchObject({
      id: 'task-new',
      title: 'New task',
      description: 'Persist later',
      priority: 'high',
      status: 'todo',
      order: 2,
      createdAt: 1000,
      updatedAt: 1000,
    });
    expect(env.todoApi.addTask).toHaveBeenCalledWith('/repo/main', newTask);
    expect(env.useTodoStore.getState().tasks['/repo/main']).toContainEqual(newTask);

    dateNowSpy.mockReturnValue(2000);
    store.updateTask('/repo/main', 'todo-0', {
      title: 'Updated title',
      sessionId: 'session-1',
    });

    dateNowSpy.mockReturnValue(3000);
    store.moveTask('/repo/main', 'doing-0', 'done', 4);

    dateNowSpy.mockReturnValue(4000);
    store.reorderTasks('/repo/main', 'todo', ['task-new', 'todo-1', 'todo-0']);

    store.deleteTask('/repo/main', 'todo-1');

    store.updateTask('/repo/missing', 'task-x', { title: 'noop' });
    store.deleteTask('/repo/missing', 'task-x');
    store.moveTask('/repo/missing', 'task-x', 'done', 0);
    store.reorderTasks('/repo/missing', 'todo', ['task-x']);

    await flushPromises();

    expect(env.todoApi.updateTask).toHaveBeenCalledWith('/repo/main', 'todo-0', {
      title: 'Updated title',
      sessionId: 'session-1',
    });
    expect(env.todoApi.moveTask).toHaveBeenCalledWith('/repo/main', 'doing-0', 'done', 4);
    expect(env.todoApi.reorderTasks).toHaveBeenCalledWith('/repo/main', 'todo', [
      'task-new',
      'todo-1',
      'todo-0',
    ]);
    expect(env.todoApi.deleteTask).toHaveBeenCalledWith('/repo/main', 'todo-1');

    const repoTasks = env.useTodoStore.getState().tasks['/repo/main'];
    expect(repoTasks.find((task) => task.id === 'todo-0')).toMatchObject({
      title: 'Updated title',
      sessionId: 'session-1',
      order: 2,
      updatedAt: 4000,
    });
    expect(repoTasks.find((task) => task.id === 'doing-0')).toMatchObject({
      status: 'done',
      order: 4,
      updatedAt: 3000,
    });
    expect(repoTasks.find((task) => task.id === 'task-new')).toMatchObject({
      order: 0,
      updatedAt: 4000,
    });
    expect(repoTasks.some((task) => task.id === 'todo-1')).toBe(false);

    expect(errorSpy).toHaveBeenCalledWith('[TodoStore] addTask IPC failed:', expect.any(Error));
    expect(errorSpy).toHaveBeenCalledWith('[TodoStore] updateTask IPC failed:', expect.any(Error));
    expect(errorSpy).toHaveBeenCalledWith('[TodoStore] moveTask IPC failed:', expect.any(Error));
    expect(errorSpy).toHaveBeenCalledWith(
      '[TodoStore] reorderTasks IPC failed:',
      expect.any(Error)
    );
    expect(errorSpy).toHaveBeenCalledWith('[TodoStore] deleteTask IPC failed:', expect.any(Error));
  });

  it('manages auto-execute queues and no-op branches for missing repos', async () => {
    const env = await loadTodoStore();
    const store = env.useTodoStore.getState();

    const missingBefore = env.useTodoStore.getState();
    store.setCurrentExecution('/repo/missing', 'task-1', 'session-1');
    store.reorderAutoExecuteQueue('/repo/missing', 0, 1);
    store.removeFromAutoExecuteQueue('/repo/missing', 'task-1');
    const missingNext = store.advanceQueue('/repo/missing');

    expect(missingNext).toBeNull();
    expect(env.useTodoStore.getState()).not.toBe(missingBefore);
    expect(env.selectAutoExecute(env.useTodoStore.getState(), '/repo/missing')).toEqual({
      running: false,
      queue: [],
      currentTaskId: null,
      currentSessionId: null,
    });

    store.startAutoExecute('/Repo/Main', ['task-1', 'task-2', 'task-3']);
    const stateAfterStart = env.selectAutoExecute(env.useTodoStore.getState(), '/repo/main');
    expect(stateAfterStart).toEqual({
      running: true,
      queue: ['task-1', 'task-2', 'task-3'],
      currentTaskId: null,
      currentSessionId: null,
    });

    const currentBeforeNoop = env.useTodoStore.getState().autoExecute['/repo/main'];
    store.setCurrentExecution('/repo/main', null, null);
    expect(env.useTodoStore.getState().autoExecute['/repo/main']).toBe(currentBeforeNoop);

    store.setCurrentExecution('/repo/main', 'task-1', 'session-1');
    expect(env.selectAutoExecute(env.useTodoStore.getState(), '/repo/main')).toMatchObject({
      currentTaskId: 'task-1',
      currentSessionId: 'session-1',
    });

    store.reorderAutoExecuteQueue('/repo/main', 2, 0);
    expect(env.selectAutoExecute(env.useTodoStore.getState(), '/repo/main').queue).toEqual([
      'task-3',
      'task-1',
      'task-2',
    ]);

    store.removeFromAutoExecuteQueue('/repo/main', 'task-1');
    expect(env.selectAutoExecute(env.useTodoStore.getState(), '/repo/main').queue).toEqual([
      'task-3',
      'task-2',
    ]);

    expect(store.advanceQueue('/repo/main')).toBe('task-3');
    expect(env.selectAutoExecute(env.useTodoStore.getState(), '/repo/main')).toMatchObject({
      queue: ['task-2'],
      currentTaskId: 'task-3',
      currentSessionId: 'session-1',
    });

    expect(store.advanceQueue('/repo/main')).toBe('task-2');
    expect(store.advanceQueue('/repo/main')).toBeNull();
    expect(env.selectAutoExecute(env.useTodoStore.getState(), '/repo/main')).toEqual({
      running: false,
      queue: [],
      currentTaskId: null,
      currentSessionId: null,
    });

    store.stopAutoExecute('/repo/main');
    expect(env.selectAutoExecute(env.useTodoStore.getState(), '/repo/main')).toEqual({
      running: false,
      queue: [],
      currentTaskId: null,
      currentSessionId: null,
    });
  });
});
