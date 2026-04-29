export interface TodoTaskContextFile {
  path: string;
  label?: string;
}

export interface TodoTaskContextDirectory {
  path: string;
  label?: string;
}

export interface TodoTaskExecutionGate {
  requiresApproval?: boolean;
  approvedAt?: number;
}

export interface TodoTaskContext {
  repoPath?: string;
  worktreePath?: string;
  dependencyTaskIds?: string[];
  executionGate?: TodoTaskExecutionGate;
  files?: TodoTaskContextFile[];
  directories?: TodoTaskContextDirectory[];
}

export interface TodoMigrationResult {
  migratedTaskCount: number;
}
