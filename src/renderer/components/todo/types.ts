import type {
  TodoTaskContext,
  TodoTaskContextDirectory,
  TodoTaskContextFile,
  TodoTaskExecutionGate,
} from '@shared/types/todo';

export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskStatus = 'todo' | 'in-progress' | 'done';

export type {
  TodoTaskContext,
  TodoTaskContextDirectory,
  TodoTaskExecutionGate,
  TodoTaskContextFile,
};

export interface TodoTask {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  createdAt: number;
  updatedAt: number;
  order: number;
  /** Preferred agent for this task. When omitted, auto-execute picks from queue settings. */
  agentId?: string;
  /** ID of the session executing this task (set when auto-execute starts) */
  sessionId?: string;
  /** Structured project context supplied to agents when this task starts a session. */
  context?: TodoTaskContext;
}

export const TASK_STATUS_LIST: TaskStatus[] = ['todo', 'in-progress', 'done'];

/** Auto-execute state per repo */
export interface AutoExecuteState {
  /** Whether auto-execute is running */
  running: boolean;
  /** Queue of task IDs to execute (in order) */
  queue: string[];
  /** Currently executing task ID */
  currentTaskId: string | null;
  /** Session ID of the current execution */
  currentSessionId: string | null;
}
