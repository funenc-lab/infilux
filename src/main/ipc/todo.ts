import {
  IPC_CHANNELS,
  isAIProvider,
  isModelForProvider,
  isReasoningEffort,
  type ModelId,
  type ReasoningEffort,
  type SessionTodoTask,
  type TodoGenerateAgentOption,
  type TodoGenerateTasksRequest,
  type TodoGenerateTasksResult,
  type TodoPolishRequest,
  type TodoPolishResult,
  type TodoTaskContext,
  type TodoTaskContextDirectory,
  type TodoTaskContextFile,
  type TodoTaskExecutionGate,
} from '@shared/types';
import { ipcMain } from 'electron';
import { generateTodoTasks, polishTodoTask } from '../services/ai';
import { localSessionManager } from '../services/LocalSessionManager';
import * as todoService from '../services/todo/TodoService';

interface RawTodoPolishOptions {
  text?: unknown;
  timeout?: unknown;
  provider?: unknown;
  model?: unknown;
  reasoningEffort?: unknown;
  prompt?: unknown;
}

interface RawTodoGenerateTasksOptions extends RawTodoPolishOptions {
  repoPath?: unknown;
  worktreePath?: unknown;
  context?: unknown;
  agents?: unknown;
  maxTasks?: unknown;
}

const MAX_TODO_POLISH_TIMEOUT_SECONDS = 600;
const MAX_TODO_POLISH_PROMPT_LENGTH = 20_000;
const MAX_TODO_GENERATE_TASKS = 12;
const MAX_TODO_GENERATE_AGENT_COUNT = 64;
const MAX_TODO_GENERATE_DEPENDENCY_COUNT = 100;
const MAX_TODO_GENERATE_CONTEXT_FILE_COUNT = 30;
const MAX_TODO_GENERATE_CONTEXT_DIRECTORY_COUNT = 30;
const MAX_TODO_GENERATE_TEXT_LENGTH = 60_000;
const MAX_TODO_GENERATE_PATH_LENGTH = 4096;
const MAX_TODO_GENERATE_LABEL_LENGTH = 512;

function normalizeNonEmptyString(value: unknown, fieldName: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a non-empty string`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  if (trimmed.length > maxLength) {
    throw new Error(`${fieldName} is too long`);
  }

  return trimmed;
}

function normalizeOptionalString(
  value: unknown,
  fieldName: string,
  maxLength: number
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length > maxLength) {
    throw new Error(`${fieldName} is too long`);
  }

  return trimmed;
}

function normalizeProviderModelRequest(
  options: RawTodoPolishOptions,
  featureName: string
): Pick<TodoPolishRequest, 'model' | 'provider' | 'reasoningEffort' | 'timeout'> {
  const timeout = typeof options.timeout === 'number' ? options.timeout : 0;
  if (!Number.isFinite(timeout) || timeout <= 0 || timeout > MAX_TODO_POLISH_TIMEOUT_SECONDS) {
    throw new Error(`${featureName} timeout is out of range`);
  }

  if (!isAIProvider(options.provider)) {
    throw new Error('Unsupported AI provider');
  }

  if (!isModelForProvider(options.provider, options.model)) {
    throw new Error('Unsupported model for AI provider');
  }

  const request: Pick<TodoPolishRequest, 'model' | 'provider' | 'reasoningEffort' | 'timeout'> = {
    timeout,
    provider: options.provider,
    model: options.model as ModelId,
  };

  if (options.reasoningEffort !== undefined) {
    if (!isReasoningEffort(options.reasoningEffort)) {
      throw new Error('Unsupported reasoning effort');
    }
    request.reasoningEffort = options.reasoningEffort as ReasoningEffort;
  }

  return request;
}

function normalizeTodoPrompt(value: unknown, featureName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`${featureName} prompt must be a string`);
  }
  if (value.length > MAX_TODO_POLISH_PROMPT_LENGTH) {
    throw new Error(`${featureName} prompt is too long`);
  }
  return value;
}

function normalizeTodoPolishOptions(options: RawTodoPolishOptions): TodoPolishRequest {
  if (!options || typeof options !== 'object') {
    throw new Error('Todo AI polish options must be an object');
  }

  const text = normalizeNonEmptyString(
    options.text,
    'Todo AI polish text',
    MAX_TODO_GENERATE_TEXT_LENGTH
  );
  const providerModel = normalizeProviderModelRequest(options, 'Todo AI polish');

  const request: TodoPolishRequest = {
    text,
    timeout: providerModel.timeout,
    provider: providerModel.provider,
    model: providerModel.model,
  };

  if (providerModel.reasoningEffort !== undefined) {
    request.reasoningEffort = providerModel.reasoningEffort;
  }

  const prompt = normalizeTodoPrompt(options.prompt, 'Todo AI polish');
  if (prompt !== undefined) {
    request.prompt = prompt;
  }

  return request;
}

function normalizeTodoTaskContextPathRef<T extends TodoTaskContextDirectory | TodoTaskContextFile>(
  value: unknown,
  fieldPrefix: string
): T {
  if (!value || typeof value !== 'object') {
    throw new Error(`${fieldPrefix} must be an object`);
  }

  const record = value as Record<string, unknown>;
  const path = normalizeNonEmptyString(
    record.path,
    `${fieldPrefix} path`,
    MAX_TODO_GENERATE_PATH_LENGTH
  );
  const label = normalizeOptionalString(
    record.label,
    `${fieldPrefix} label`,
    MAX_TODO_GENERATE_LABEL_LENGTH
  );

  return (label ? { path, label } : { path }) as T;
}

function normalizeTodoTaskContextDependencyIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error('Todo AI generate context dependency ids must be an array');
  }

  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of value.slice(0, MAX_TODO_GENERATE_DEPENDENCY_COUNT)) {
    const dependencyTaskId = normalizeOptionalString(
      item,
      'Todo AI generate context dependency id',
      MAX_TODO_GENERATE_LABEL_LENGTH
    );
    if (!dependencyTaskId || seen.has(dependencyTaskId)) {
      continue;
    }

    seen.add(dependencyTaskId);
    result.push(dependencyTaskId);
  }

  return result;
}

function normalizeTodoTaskExecutionGate(value: unknown): TodoTaskExecutionGate | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Todo AI generate context execution gate must be an object');
  }

  const record = value as Record<string, unknown>;
  if (record.requiresApproval !== true) {
    return undefined;
  }

  const approvedAt =
    typeof record.approvedAt === 'number' && Number.isFinite(record.approvedAt)
      ? record.approvedAt
      : undefined;

  return {
    requiresApproval: true,
    ...(approvedAt !== undefined ? { approvedAt } : {}),
  };
}

function normalizeTodoTaskContext(value: unknown): TodoTaskContext | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!value || typeof value !== 'object') {
    throw new Error('Todo AI generate context must be an object');
  }

  const record = value as Record<string, unknown>;
  const repoPath = normalizeOptionalString(
    record.repoPath,
    'Todo AI generate context repo path',
    MAX_TODO_GENERATE_PATH_LENGTH
  );
  const worktreePath = normalizeOptionalString(
    record.worktreePath,
    'Todo AI generate context worktree path',
    MAX_TODO_GENERATE_PATH_LENGTH
  );
  let dependencyTaskIds: string[] | undefined;
  const executionGate = normalizeTodoTaskExecutionGate(record.executionGate);
  let files: TodoTaskContextFile[] | undefined;
  let directories: TodoTaskContextDirectory[] | undefined;

  if (record.dependencyTaskIds !== undefined) {
    dependencyTaskIds = normalizeTodoTaskContextDependencyIds(record.dependencyTaskIds);
  }

  if (record.files !== undefined) {
    if (!Array.isArray(record.files)) {
      throw new Error('Todo AI generate context files must be an array');
    }
    files = record.files
      .slice(0, MAX_TODO_GENERATE_CONTEXT_FILE_COUNT)
      .map((file) =>
        normalizeTodoTaskContextPathRef<TodoTaskContextFile>(file, 'Todo AI generate context file')
      );
  }

  if (record.directories !== undefined) {
    if (!Array.isArray(record.directories)) {
      throw new Error('Todo AI generate context directories must be an array');
    }
    directories = record.directories
      .slice(0, MAX_TODO_GENERATE_CONTEXT_DIRECTORY_COUNT)
      .map((directory) =>
        normalizeTodoTaskContextPathRef<TodoTaskContextDirectory>(
          directory,
          'Todo AI generate context directory'
        )
      );
  }

  const context: TodoTaskContext = {
    ...(repoPath ? { repoPath } : {}),
    ...(worktreePath ? { worktreePath } : {}),
    ...(dependencyTaskIds && dependencyTaskIds.length > 0 ? { dependencyTaskIds } : {}),
    ...(executionGate ? { executionGate } : {}),
    ...(files && files.length > 0 ? { files } : {}),
    ...(directories && directories.length > 0 ? { directories } : {}),
  };

  return Object.keys(context).length > 0 ? context : undefined;
}

function normalizeTodoGenerateAgent(value: unknown): TodoGenerateAgentOption {
  if (!value || typeof value !== 'object') {
    throw new Error('Todo AI generate agent must be an object');
  }

  const record = value as Record<string, unknown>;
  return {
    agentId: normalizeNonEmptyString(
      record.agentId,
      'Todo AI generate agent id',
      MAX_TODO_GENERATE_LABEL_LENGTH
    ),
    name: normalizeNonEmptyString(
      record.name,
      'Todo AI generate agent name',
      MAX_TODO_GENERATE_LABEL_LENGTH
    ),
    command: normalizeNonEmptyString(
      record.command,
      'Todo AI generate agent command',
      MAX_TODO_GENERATE_LABEL_LENGTH
    ),
    ...(record.isDefault === true ? { isDefault: true } : {}),
  };
}

function normalizeTodoGenerateAgents(value: unknown): TodoGenerateAgentOption[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error('Todo AI generate agents must be an array');
  }
  return value
    .slice(0, MAX_TODO_GENERATE_AGENT_COUNT)
    .map((agent) => normalizeTodoGenerateAgent(agent));
}

function normalizeTodoGenerateMaxTasks(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Todo AI generate maxTasks must be a number');
  }
  if (value < 1 || value > MAX_TODO_GENERATE_TASKS) {
    throw new Error('Todo AI generate maxTasks is out of range');
  }
  return Math.floor(value);
}

function normalizeTodoGenerateTasksOptions(
  options: RawTodoGenerateTasksOptions
): TodoGenerateTasksRequest {
  if (!options || typeof options !== 'object') {
    throw new Error('Todo AI generate options must be an object');
  }

  const text = normalizeNonEmptyString(
    options.text,
    'Todo AI generate text',
    MAX_TODO_GENERATE_TEXT_LENGTH
  );
  const providerModel = normalizeProviderModelRequest(options, 'Todo AI generate');
  const request: TodoGenerateTasksRequest = {
    text,
    timeout: providerModel.timeout,
    provider: providerModel.provider,
    model: providerModel.model,
  };

  if (providerModel.reasoningEffort !== undefined) {
    request.reasoningEffort = providerModel.reasoningEffort;
  }

  const prompt = normalizeTodoPrompt(options.prompt, 'Todo AI generate');
  const repoPath = normalizeOptionalString(
    options.repoPath,
    'Todo AI generate repo path',
    MAX_TODO_GENERATE_PATH_LENGTH
  );
  const worktreePath = normalizeOptionalString(
    options.worktreePath,
    'Todo AI generate worktree path',
    MAX_TODO_GENERATE_PATH_LENGTH
  );
  const context = normalizeTodoTaskContext(options.context);
  const agents = normalizeTodoGenerateAgents(options.agents);
  const maxTasks = normalizeTodoGenerateMaxTasks(options.maxTasks);

  if (prompt !== undefined) {
    request.prompt = prompt;
  }
  if (repoPath) {
    request.repoPath = repoPath;
  }
  if (worktreePath) {
    request.worktreePath = worktreePath;
  }
  if (context) {
    request.context = context;
  }
  if (agents) {
    request.agents = agents;
  }
  if (maxTasks !== undefined) {
    request.maxTasks = maxTasks;
  }

  return request;
}

export function registerTodoHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.TODO_GET_ALL_PROJECTS, async () => {
    return localSessionManager.getAllTodoProjects();
  });

  ipcMain.handle(IPC_CHANNELS.TODO_GET_TASKS, async (_, repoPath: string) => {
    return localSessionManager.getTodoTasks(repoPath);
  });

  ipcMain.handle(
    IPC_CHANNELS.TODO_ADD_TASK,
    async (_event, repoPath: string, task: SessionTodoTask) => {
      return localSessionManager.addTodoTask(repoPath, task);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TODO_UPDATE_TASK,
    async (
      _event,
      repoPath: string,
      taskId: string,
      updates: Partial<
        Pick<
          SessionTodoTask,
          'title' | 'description' | 'priority' | 'status' | 'agentId' | 'sessionId' | 'context'
        >
      >
    ) => {
      return localSessionManager.updateTodoTask(repoPath, taskId, updates);
    }
  );

  ipcMain.handle(IPC_CHANNELS.TODO_DELETE_TASK, async (_, repoPath: string, taskId: string) => {
    return localSessionManager.deleteTodoTask(repoPath, taskId);
  });

  ipcMain.handle(
    IPC_CHANNELS.TODO_MOVE_TASK,
    async (_, repoPath: string, taskId: string, newStatus: string, newOrder: number) => {
      return localSessionManager.moveTodoTask(repoPath, taskId, newStatus, newOrder);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TODO_REORDER_TASKS,
    async (_, repoPath: string, status: string, orderedIds: string[]) => {
      return localSessionManager.reorderTodoTasks(repoPath, status, orderedIds);
    }
  );

  ipcMain.handle(IPC_CHANNELS.TODO_MIGRATE, async (_, boardsJson: string) => {
    return localSessionManager.migrateTodoBoardsFromLocalStorage(boardsJson);
  });

  ipcMain.handle(
    IPC_CHANNELS.TODO_AI_POLISH,
    async (_, options: RawTodoPolishOptions): Promise<TodoPolishResult> => {
      return polishTodoTask(normalizeTodoPolishOptions(options));
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TODO_AI_GENERATE_TASKS,
    async (_, options: RawTodoGenerateTasksOptions): Promise<TodoGenerateTasksResult> => {
      return generateTodoTasks(normalizeTodoGenerateTasksOptions(options));
    }
  );
}

export function cleanupTodo(): Promise<void> {
  return todoService.close();
}

export function cleanupTodoSync(): void {
  todoService.closeSync();
}
