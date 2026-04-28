export interface TodoTaskContextFile {
  path: string;
  label?: string;
}

export interface TodoTaskContextDirectory {
  path: string;
  label?: string;
}

export interface TodoTaskContext {
  repoPath?: string;
  worktreePath?: string;
  files?: TodoTaskContextFile[];
  directories?: TodoTaskContextDirectory[];
}

export interface TodoMigrationResult {
  migratedTaskCount: number;
}
