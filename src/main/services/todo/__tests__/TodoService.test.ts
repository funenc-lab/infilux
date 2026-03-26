import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type TaskRecord = {
  id: string;
  repo_path: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  order: number;
  created_at: number;
  updated_at: number;
};

const todoServiceDoubles = vi.hoisted(() => {
  class FakeDatabase {
    public configure = vi.fn();
    public run = vi.fn(
      (
        sql: string,
        params: unknown[] | ((err: Error | null) => void),
        callback?: (err: Error | null) => void
      ) => {
        const normalizedParams = Array.isArray(params) ? params : [];
        const cb = (typeof params === 'function' ? params : callback) ?? (() => {});
        state.lastRuns.push({ sql, params: normalizedParams });

        const injectedError = consumeRunError(sql);
        if (injectedError) {
          cb(injectedError);
          return this;
        }

        if (sql === 'BEGIN TRANSACTION') {
          state.transactionSnapshot = cloneTasks(state.tasks);
          cb(null);
          return this;
        }

        if (sql === 'COMMIT') {
          state.transactionSnapshot = null;
          cb(null);
          return this;
        }

        if (sql === 'ROLLBACK') {
          if (state.transactionSnapshot) {
            state.tasks = cloneTasks(state.transactionSnapshot);
          }
          state.transactionSnapshot = null;
          cb(null);
          return this;
        }

        if (sql.startsWith('INSERT INTO tasks')) {
          const [id, repoPath, title, description, priority, status, order, createdAt, updatedAt] =
            normalizedParams as [
              string,
              string,
              string,
              string,
              string,
              string,
              number,
              number,
              number,
            ];
          state.tasks.push({
            id,
            repo_path: repoPath,
            title,
            description,
            priority,
            status,
            order,
            created_at: createdAt,
            updated_at: updatedAt,
          });
          cb(null);
          return this;
        }

        if (sql.startsWith('INSERT OR IGNORE INTO tasks')) {
          const [id, repoPath, title, description, priority, status, order, createdAt, updatedAt] =
            normalizedParams as [
              string,
              string,
              string,
              string,
              string,
              string,
              number,
              number,
              number,
            ];
          if (!state.tasks.some((task) => task.id === id && task.repo_path === repoPath)) {
            state.tasks.push({
              id,
              repo_path: repoPath,
              title,
              description,
              priority,
              status,
              order,
              created_at: createdAt,
              updated_at: updatedAt,
            });
          }
          cb(null);
          return this;
        }

        if (sql.startsWith('UPDATE tasks SET status = ?')) {
          const [newStatus, newOrder, updatedAt, repoPath, taskId] = normalizedParams as [
            string,
            number,
            number,
            string,
            string,
          ];
          for (const task of state.tasks) {
            if (task.repo_path === repoPath && task.id === taskId) {
              task.status = newStatus;
              task.order = newOrder;
              task.updated_at = updatedAt;
            }
          }
          cb(null);
          return this;
        }

        if (sql.startsWith('UPDATE tasks SET "order" = ?')) {
          const [newOrder, updatedAt, repoPath, taskId, status] = normalizedParams as [
            number,
            number,
            string,
            string,
            string,
          ];
          for (const task of state.tasks) {
            if (task.repo_path === repoPath && task.id === taskId && task.status === status) {
              task.order = newOrder;
              task.updated_at = updatedAt;
            }
          }
          cb(null);
          return this;
        }

        if (sql.startsWith('UPDATE tasks SET')) {
          const repoPath = normalizedParams.at(-2) as string;
          const taskId = normalizedParams.at(-1) as string;
          const task = state.tasks.find(
            (item) => item.repo_path === repoPath && item.id === taskId
          );
          if (task) {
            const assignments = sql
              .slice('UPDATE tasks SET '.length, sql.indexOf(' WHERE repo_path'))
              .split(', ')
              .filter(Boolean);
            let index = 0;
            for (const assignment of assignments) {
              const field = assignment.split(' = ?')[0];
              const value = normalizedParams[index++];
              if (field === 'title') task.title = value as string;
              if (field === 'description') task.description = value as string;
              if (field === 'priority') task.priority = value as string;
              if (field === 'status') task.status = value as string;
              if (field === 'updated_at') task.updated_at = value as number;
            }
          }
          cb(null);
          return this;
        }

        if (sql.startsWith('DELETE FROM tasks')) {
          const [repoPath, taskId] = normalizedParams as [string, string];
          state.tasks = state.tasks.filter(
            (task) => !(task.repo_path === repoPath && task.id === taskId)
          );
          cb(null);
          return this;
        }

        cb(null);
        return this;
      }
    );

    public all = vi.fn(
      (
        sql: string,
        params: unknown[] | ((err: Error | null, rows: TaskRecord[]) => void),
        callback?: (err: Error | null, rows: TaskRecord[]) => void
      ) => {
        const normalizedParams = Array.isArray(params) ? params : [];
        const cb = (typeof params === 'function' ? params : callback) ?? (() => {});
        state.lastAlls.push({ sql, params: normalizedParams });

        const injectedError = consumeAllError(sql);
        if (injectedError) {
          cb(injectedError, []);
          return this;
        }

        let rows = cloneTasks(state.tasks);
        if (sql.includes('WHERE repo_path = ?')) {
          const repoPath = normalizedParams[0] as string;
          rows = rows.filter((row) => row.repo_path === repoPath);
        }
        if (sql.includes('ORDER BY status, "order"')) {
          rows.sort((a, b) => a.status.localeCompare(b.status) || a.order - b.order);
        } else if (sql.includes('ORDER BY repo_path, status, "order"')) {
          rows.sort(
            (a, b) =>
              a.repo_path.localeCompare(b.repo_path) ||
              a.status.localeCompare(b.status) ||
              a.order - b.order
          );
        }

        cb(null, rows);
        return this;
      }
    );

    public exec = vi.fn((sql: string, callback?: (err: Error | null) => void) => {
      state.lastExecs.push(sql);
      callback?.(consumeExecError(sql));
      return this;
    });

    public close = vi.fn((callback?: (err: Error | null) => void) => {
      callback?.(state.closeError);
    });
  }

  const appGetPath = vi.fn();
  const databases: FakeDatabase[] = [];
  const sqlite3 = {
    OPEN_READWRITE: 1,
    OPEN_CREATE: 2,
    Database: vi.fn(function FakeDatabaseConstructor(
      this: FakeDatabase,
      _path: string,
      _flags: number,
      callback: (err: Error | null) => void
    ) {
      const database = new FakeDatabase();
      databases.push(database);
      queueMicrotask(() => {
        callback(state.initializeError);
      });
      return database;
    }),
  };

  const state = {
    tasks: [] as TaskRecord[],
    transactionSnapshot: null as TaskRecord[] | null,
    lastRuns: [] as Array<{ sql: string; params: unknown[] }>,
    lastAlls: [] as Array<{ sql: string; params: unknown[] }>,
    lastExecs: [] as string[],
    runErrors: [] as Array<{ pattern: string; error: Error }>,
    allErrors: [] as Array<{ pattern: string; error: Error }>,
    execErrors: [] as Array<{ pattern: string; error: Error }>,
    initializeError: null as Error | null,
    closeError: null as Error | null,
  };

  function cloneTasks(tasks: TaskRecord[]) {
    return tasks.map((task) => ({ ...task }));
  }

  function consumeMatchingError(
    errors: Array<{ pattern: string; error: Error }>,
    sql: string
  ): Error | null {
    const index = errors.findIndex((entry) => sql.includes(entry.pattern));
    if (index === -1) {
      return null;
    }
    return errors.splice(index, 1)[0]?.error ?? null;
  }

  function consumeRunError(sql: string) {
    return consumeMatchingError(state.runErrors, sql);
  }

  function consumeAllError(sql: string) {
    return consumeMatchingError(state.allErrors, sql);
  }

  function consumeExecError(sql: string) {
    return consumeMatchingError(state.execErrors, sql);
  }

  function reset() {
    appGetPath.mockReset();
    appGetPath.mockReturnValue('/tmp/app-data');
    sqlite3.Database.mockClear();
    databases.length = 0;
    state.tasks = [];
    state.transactionSnapshot = null;
    state.lastRuns = [];
    state.lastAlls = [];
    state.lastExecs = [];
    state.runErrors = [];
    state.allErrors = [];
    state.execErrors = [];
    state.initializeError = null;
    state.closeError = null;
  }

  return {
    appGetPath,
    sqlite3,
    databases,
    state,
    reset,
  };
});

vi.mock('electron', () => ({
  app: {
    getPath: todoServiceDoubles.appGetPath,
  },
}));

vi.mock('sqlite3', () => ({
  default: todoServiceDoubles.sqlite3,
}));

describe('TodoService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    todoServiceDoubles.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes the database, creates schema, and loads tasks by repo', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const service = await import('../TodoService');

    await expect(service.initialize()).resolves.toBeUndefined();
    expect(todoServiceDoubles.appGetPath).toHaveBeenCalledWith('userData');
    expect(todoServiceDoubles.sqlite3.Database).toHaveBeenCalledWith(
      '/tmp/app-data/todo.db',
      todoServiceDoubles.sqlite3.OPEN_READWRITE | todoServiceDoubles.sqlite3.OPEN_CREATE,
      expect.any(Function)
    );
    expect(todoServiceDoubles.databases[0]?.configure).toHaveBeenCalledWith('busyTimeout', 3000);
    expect(todoServiceDoubles.databases[0]?.exec).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      '[TodoService] Database initialized at',
      '/tmp/app-data/todo.db'
    );

    todoServiceDoubles.state.tasks.push(
      {
        id: '1',
        repo_path: '/repo',
        title: 'Todo',
        description: 'Desc',
        priority: 'high',
        status: 'doing',
        order: 2,
        created_at: 10,
        updated_at: 20,
      },
      {
        id: '2',
        repo_path: '/repo',
        title: 'Earlier',
        description: '',
        priority: 'low',
        status: 'done',
        order: 0,
        created_at: 1,
        updated_at: 2,
      }
    );

    await expect(service.getTasks('/repo')).resolves.toEqual([
      {
        id: '1',
        title: 'Todo',
        description: 'Desc',
        priority: 'high',
        status: 'doing',
        createdAt: 10,
        updatedAt: 20,
        order: 2,
      },
      {
        id: '2',
        title: 'Earlier',
        description: '',
        priority: 'low',
        status: 'done',
        createdAt: 1,
        updatedAt: 2,
        order: 0,
      },
    ]);
  });

  it('supports add, update, move, delete, export, and no-op updates', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(777);
    const service = await import('../TodoService');
    await service.initialize();

    await expect(
      service.addTask('/repo', {
        id: 'task-1',
        title: 'First',
        description: 'Body',
        priority: 'medium',
        status: 'todo',
        order: 1,
        createdAt: 100,
        updatedAt: 101,
      })
    ).resolves.toEqual({
      id: 'task-1',
      title: 'First',
      description: 'Body',
      priority: 'medium',
      status: 'todo',
      createdAt: 100,
      updatedAt: 101,
      order: 1,
    });

    await service.updateTask('/repo', 'task-1', {
      title: 'Updated',
      description: 'Changed',
      priority: 'high',
      status: 'doing',
    });
    await service.updateTask('/repo', 'task-1', {});
    await service.moveTask('/repo', 'task-1', 'done', 3);

    await expect(service.exportAllTasks()).resolves.toEqual({
      '/repo': [
        {
          id: 'task-1',
          title: 'Updated',
          description: 'Changed',
          priority: 'high',
          status: 'done',
          createdAt: 100,
          updatedAt: 777,
          order: 3,
        },
      ],
    });

    await service.deleteTask('/repo', 'task-1');
    await expect(service.getTasks('/repo')).resolves.toEqual([]);
  });

  it('reorders tasks in a transaction and rolls back when a write fails', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(999);
    const service = await import('../TodoService');
    await service.initialize();

    todoServiceDoubles.state.tasks.push(
      {
        id: 'a',
        repo_path: '/repo',
        title: 'A',
        description: '',
        priority: 'medium',
        status: 'todo',
        order: 5,
        created_at: 1,
        updated_at: 1,
      },
      {
        id: 'b',
        repo_path: '/repo',
        title: 'B',
        description: '',
        priority: 'medium',
        status: 'todo',
        order: 6,
        created_at: 2,
        updated_at: 2,
      }
    );

    await expect(service.reorderTasks('/repo', 'todo', ['b', 'a'])).resolves.toBeUndefined();
    expect(todoServiceDoubles.state.tasks.find((task) => task.id === 'b')?.order).toBe(0);
    expect(todoServiceDoubles.state.tasks.find((task) => task.id === 'a')?.order).toBe(1);

    todoServiceDoubles.state.runErrors.push({
      pattern: 'UPDATE tasks SET "order" = ?',
      error: new Error('reorder failed'),
    });

    await expect(service.reorderTasks('/repo', 'todo', ['a', 'b'])).rejects.toThrow(
      'reorder failed'
    );
    expect(todoServiceDoubles.state.lastRuns.some((entry) => entry.sql === 'ROLLBACK')).toBe(true);
    expect(todoServiceDoubles.state.tasks.find((task) => task.id === 'b')?.order).toBe(0);
    expect(todoServiceDoubles.state.tasks.find((task) => task.id === 'a')?.order).toBe(1);
  });

  it('migrates localStorage boards with defaults, ignores duplicates, and rolls back on failure', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const service = await import('../TodoService');
    await service.initialize();

    const boardsJson = JSON.stringify({
      '/repo-a': {
        tasks: [
          {
            id: 'one',
            title: 'First',
            description: 'Body',
            priority: 'low',
            status: 'todo',
            createdAt: 10,
            updatedAt: 11,
            order: 1,
          },
          {
            id: 'one',
            title: 'Duplicate',
            description: 'Ignored',
          },
        ],
      },
      '/repo-b': {},
      '/repo-c': {
        tasks: [
          {
            id: 'two',
            title: 'Defaulted',
          },
        ],
      },
    });

    await expect(service.migrateFromLocalStorage(boardsJson)).resolves.toBeUndefined();
    expect(logSpy).toHaveBeenCalledWith('[TodoService] Migration from localStorage completed');
    expect(todoServiceDoubles.state.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'one',
          repo_path: '/repo-a',
          title: 'First',
          description: 'Body',
          priority: 'low',
          status: 'todo',
          order: 1,
        }),
        expect.objectContaining({
          id: 'two',
          repo_path: '/repo-c',
          title: 'Defaulted',
          description: '',
          priority: 'medium',
          status: 'todo',
          order: 0,
        }),
      ])
    );
    expect(todoServiceDoubles.state.tasks.filter((task) => task.id === 'one')).toHaveLength(1);

    todoServiceDoubles.state.runErrors.push({
      pattern: 'INSERT OR IGNORE INTO tasks',
      error: new Error('migration failed'),
    });
    const snapshot = todoServiceDoubles.state.tasks.map((task) => ({ ...task }));
    await expect(
      service.migrateFromLocalStorage(
        JSON.stringify({
          '/repo-z': {
            tasks: [{ id: 'z', title: 'Broken' }],
          },
        })
      )
    ).rejects.toThrow('migration failed');
    expect(todoServiceDoubles.state.lastRuns.some((entry) => entry.sql === 'ROLLBACK')).toBe(true);
    expect(todoServiceDoubles.state.tasks).toEqual(snapshot);
  });

  it('throws when used before initialize and handles close, close warnings, and sync close', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let service = await import('../TodoService');

    await expect(service.getTasks('/repo')).rejects.toThrow(
      '[TodoService] Database not initialized. Call initialize() first.'
    );
    await expect(service.close()).resolves.toBeUndefined();
    service.closeSync();

    vi.resetModules();
    todoServiceDoubles.reset();
    todoServiceDoubles.state.closeError = new Error('close failed');
    service = await import('../TodoService');
    await service.initialize();
    await expect(service.close()).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      '[TodoService] Failed to close database:',
      expect.any(Error)
    );

    await expect(service.close()).resolves.toBeUndefined();
    service.closeSync();
    await expect(service.exportAllTasks()).rejects.toThrow(
      '[TodoService] Database not initialized. Call initialize() first.'
    );
  });

  it('surfaces initialize, exec, and query failures', async () => {
    todoServiceDoubles.state.initializeError = new Error('open failed');
    let service = await import('../TodoService');
    await expect(service.initialize()).rejects.toThrow('open failed');

    vi.resetModules();
    todoServiceDoubles.reset();
    todoServiceDoubles.state.execErrors.push({
      pattern: 'CREATE TABLE IF NOT EXISTS tasks',
      error: new Error('schema failed'),
    });
    service = await import('../TodoService');
    await expect(service.initialize()).rejects.toThrow('schema failed');

    vi.resetModules();
    todoServiceDoubles.reset();
    service = await import('../TodoService');
    await service.initialize();
    todoServiceDoubles.state.allErrors.push({
      pattern: 'SELECT * FROM tasks WHERE repo_path = ?',
      error: new Error('select failed'),
    });
    await expect(service.getTasks('/repo')).rejects.toThrow('select failed');
  });
});
