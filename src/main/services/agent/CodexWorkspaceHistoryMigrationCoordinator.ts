export type CodexWorkspaceHistoryMigrationOperation = () => Promise<void> | void;

export interface CodexWorkspaceHistoryMigrationScheduler {
  schedule(key: string, operation: CodexWorkspaceHistoryMigrationOperation): Promise<void>;
}

export interface CodexWorkspaceHistoryMigrationCoordinatorOptions {
  defer?: (operation: () => void) => void;
  onError?: (error: unknown) => void;
}

function deferWithSetImmediate(operation: () => void): void {
  setImmediate(operation);
}

function reportUnhandledMigrationError(error: unknown): void {
  console.error('[CodexWorkspaceHistoryMigrationCoordinator] Migration failed', error);
}

export class CodexWorkspaceHistoryMigrationCoordinator
  implements CodexWorkspaceHistoryMigrationScheduler
{
  private readonly defer: (operation: () => void) => void;
  private readonly onError: (error: unknown) => void;
  private readonly scheduledTasks = new Map<string, Promise<void>>();

  constructor(options: CodexWorkspaceHistoryMigrationCoordinatorOptions = {}) {
    this.defer = options.defer ?? deferWithSetImmediate;
    this.onError = options.onError ?? reportUnhandledMigrationError;
  }

  schedule(key: string, operation: CodexWorkspaceHistoryMigrationOperation): Promise<void> {
    const existingTask = this.scheduledTasks.get(key);
    if (existingTask) {
      return existingTask;
    }

    const task = new Promise<void>((resolve) => {
      this.defer(resolve);
    })
      .then(operation)
      .catch((error: unknown) => {
        this.onError(error);
      });

    this.scheduledTasks.set(key, task);
    void task.finally(() => {
      if (this.scheduledTasks.get(key) === task) {
        this.scheduledTasks.delete(key);
      }
    });

    return task;
  }
}
