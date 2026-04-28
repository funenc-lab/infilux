import type {
  SessionTodoTask,
  TodoMigrationResult,
  TodoTaskContext,
  TodoTaskContextDirectory,
  TodoTaskContextFile,
} from '@shared/types';
import {
  getSharedLocalStorageSnapshot,
  markLegacyLocalStorageMigrated,
  readSharedTodoTasks,
  updateSharedSessionState,
  writeSharedLocalStorageSnapshot,
} from './SharedSessionState';

function now(): number {
  return Date.now();
}

const TODO_PRIORITIES = new Set(['low', 'medium', 'high']);
const TODO_STATUSES = new Set(['todo', 'in-progress', 'done']);

interface LegacyTodoBoards {
  [repoPath: string]: {
    tasks?: unknown;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeTodoPriority(value: unknown): string {
  return typeof value === 'string' && TODO_PRIORITIES.has(value) ? value : 'medium';
}

function normalizeTodoStatus(value: unknown): string {
  if (typeof value !== 'string') {
    return 'todo';
  }

  const normalized = value.trim().toLowerCase();
  if (TODO_STATUSES.has(normalized)) {
    return normalized;
  }
  if (normalized === 'doing' || normalized === 'in progress' || normalized === 'in_progress') {
    return 'in-progress';
  }
  if (normalized === 'complete' || normalized === 'completed') {
    return 'done';
  }
  return 'todo';
}

function normalizeTimestamp(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeOrder(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeTodoTaskContextRefs<T extends TodoTaskContextDirectory | TodoTaskContextFile>(
  value: unknown
): T[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map((ref) => {
      const path = normalizeNonEmptyString(ref.path);
      if (!path) {
        return null;
      }
      const label = normalizeNonEmptyString(ref.label);
      return label ? { path, label } : { path };
    })
    .filter((ref): ref is T => ref !== null);
}

function normalizeTodoTaskContext(value: unknown): TodoTaskContext | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const context: TodoTaskContext = {};
  const repoPath = normalizeNonEmptyString(value.repoPath);
  const worktreePath = normalizeNonEmptyString(value.worktreePath);
  const files = normalizeTodoTaskContextRefs<TodoTaskContextFile>(value.files);
  const directories = normalizeTodoTaskContextRefs<TodoTaskContextDirectory>(value.directories);

  if (repoPath) {
    context.repoPath = repoPath;
  }
  if (worktreePath) {
    context.worktreePath = worktreePath;
  }
  if (files.length > 0) {
    context.files = files;
  }
  if (directories.length > 0) {
    context.directories = directories;
  }

  return context.repoPath || context.worktreePath || context.files || context.directories
    ? context
    : undefined;
}

function normalizeLegacyTodoTask(value: unknown, fallbackOrder: number, fallbackTime: number) {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.trim().length === 0) {
    return null;
  }
  if (typeof value.title !== 'string' || value.title.trim().length === 0) {
    return null;
  }

  const task: SessionTodoTask = {
    id: value.id.trim(),
    title: value.title.trim(),
    description: typeof value.description === 'string' ? value.description : '',
    priority: normalizeTodoPriority(value.priority),
    status: normalizeTodoStatus(value.status),
    order: normalizeOrder(value.order, fallbackOrder),
    createdAt: normalizeTimestamp(value.createdAt, fallbackTime),
    updatedAt: normalizeTimestamp(value.updatedAt, fallbackTime),
  };

  if (typeof value.sessionId === 'string' && value.sessionId.length > 0) {
    task.sessionId = value.sessionId;
  }
  if (typeof value.agentId === 'string' && value.agentId.length > 0) {
    task.agentId = value.agentId;
  }
  const context = normalizeTodoTaskContext(value.context);
  if (context) {
    task.context = context;
  }

  return task;
}

function parseLegacyTodoBoards(boardsJson: string): LegacyTodoBoards {
  const parsed = JSON.parse(boardsJson) as unknown;
  if (!isRecord(parsed)) {
    throw new Error('Legacy todo boards must be an object');
  }
  return parsed as LegacyTodoBoards;
}

export class LocalSessionManager {
  getSessionState(): { localStorage: Record<string, string> } {
    return {
      localStorage: getSharedLocalStorageSnapshot(),
    };
  }

  syncLocalStorage(localStorage: Record<string, string>): void {
    writeSharedLocalStorageSnapshot(localStorage);
  }

  importLegacyLocalStorage(localStorage: Record<string, string>): void {
    writeSharedLocalStorageSnapshot(localStorage);
    markLegacyLocalStorageMigrated();
  }

  migrateTodoBoardsFromLocalStorage(boardsJson: string): TodoMigrationResult {
    const boards = parseLegacyTodoBoards(boardsJson);
    const timestamp = now();
    let migratedTaskCount = 0;

    updateSharedSessionState((current) => {
      const todos = { ...current.todos };

      for (const [repoPath, board] of Object.entries(boards)) {
        if (!isRecord(board) || !Array.isArray(board.tasks)) {
          continue;
        }

        const existingTasks = todos[repoPath] ?? [];
        const existingIds = new Set(existingTasks.map((task) => task.id));
        const nextTasks = [...existingTasks];

        for (const rawTask of board.tasks) {
          const task = normalizeLegacyTodoTask(rawTask, nextTasks.length, timestamp);
          if (!task || existingIds.has(task.id)) {
            continue;
          }

          existingIds.add(task.id);
          nextTasks.push(task);
          migratedTaskCount += 1;
        }

        if (nextTasks.length !== existingTasks.length) {
          todos[repoPath] = nextTasks;
        }
      }

      return {
        ...current,
        updatedAt: migratedTaskCount > 0 ? timestamp : current.updatedAt,
        todos,
      };
    });

    return { migratedTaskCount };
  }

  getTodoTasks(repoPath: string): SessionTodoTask[] {
    return readSharedTodoTasks(repoPath);
  }

  addTodoTask(repoPath: string, task: SessionTodoTask): SessionTodoTask {
    updateSharedSessionState((current) => ({
      ...current,
      updatedAt: now(),
      todos: {
        ...current.todos,
        [repoPath]: [...(current.todos[repoPath] ?? []), task],
      },
    }));
    return task;
  }

  updateTodoTask(
    repoPath: string,
    taskId: string,
    updates: Partial<
      Pick<
        SessionTodoTask,
        'title' | 'description' | 'priority' | 'status' | 'agentId' | 'sessionId' | 'context'
      >
    >
  ): void {
    updateSharedSessionState((current) => ({
      ...current,
      updatedAt: now(),
      todos: {
        ...current.todos,
        [repoPath]: (current.todos[repoPath] ?? []).map((task) =>
          task.id === taskId ? { ...task, ...updates, updatedAt: now() } : task
        ),
      },
    }));
  }

  deleteTodoTask(repoPath: string, taskId: string): void {
    updateSharedSessionState((current) => ({
      ...current,
      updatedAt: now(),
      todos: {
        ...current.todos,
        [repoPath]: (current.todos[repoPath] ?? []).filter((task) => task.id !== taskId),
      },
    }));
  }

  moveTodoTask(repoPath: string, taskId: string, newStatus: string, newOrder: number): void {
    updateSharedSessionState((current) => ({
      ...current,
      updatedAt: now(),
      todos: {
        ...current.todos,
        [repoPath]: (current.todos[repoPath] ?? []).map((task) =>
          task.id === taskId
            ? { ...task, status: newStatus, order: newOrder, updatedAt: now() }
            : task
        ),
      },
    }));
  }

  reorderTodoTasks(repoPath: string, status: string, orderedIds: string[]): void {
    const orderMap = new Map(orderedIds.map((id, index) => [id, index]));
    updateSharedSessionState((current) => ({
      ...current,
      updatedAt: now(),
      todos: {
        ...current.todos,
        [repoPath]: (current.todos[repoPath] ?? []).map((task) =>
          task.status === status && orderMap.has(task.id)
            ? { ...task, order: orderMap.get(task.id) ?? task.order, updatedAt: now() }
            : task
        ),
      },
    }));
  }
}

export const localSessionManager = new LocalSessionManager();
