import type {
  TodoTask,
  TodoTaskContext,
  TodoTaskContextDirectory,
  TodoTaskContextFile,
  TodoTaskExecutionGate,
} from './types';

export type TodoTaskApprovalState = 'approved' | 'none' | 'pending';

export interface TodoTaskContextFallback {
  repoPath?: string;
  worktreePath?: string;
  dependencyTaskIds?: readonly string[];
  files?: readonly TodoTaskContextFile[];
  directories?: readonly TodoTaskContextDirectory[];
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function dedupePathRefs<T extends TodoTaskContextDirectory | TodoTaskContextFile>(
  refs: readonly T[] | undefined
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const ref of refs ?? []) {
    const path = nonEmpty(ref.path);
    if (!path || seen.has(path)) {
      continue;
    }

    seen.add(path);
    const label = nonEmpty(ref.label);
    result.push((label ? { path, label } : { path }) as T);
  }

  return result;
}

function dedupeStringRefs(values: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values ?? []) {
    const normalized = nonEmpty(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function normalizeTodoTaskExecutionGate(
  executionGate: TodoTaskExecutionGate | undefined
): TodoTaskExecutionGate | undefined {
  if (!executionGate?.requiresApproval) {
    return undefined;
  }

  const approvedAt =
    typeof executionGate.approvedAt === 'number' && Number.isFinite(executionGate.approvedAt)
      ? executionGate.approvedAt
      : undefined;

  return {
    requiresApproval: true,
    ...(approvedAt !== undefined ? { approvedAt } : {}),
  };
}

function normalizeDirectoryPath(path: string): string {
  return path.trim().replace(/[\\/]+$/g, '');
}

export function createTodoContextFile(path: string): TodoTaskContextFile {
  return {
    path,
    label: getPathDisplayName(path),
  };
}

export function createTodoContextDirectory(path: string): TodoTaskContextDirectory {
  const normalizedPath = normalizeDirectoryPath(path);
  return {
    path: normalizedPath,
    label: getPathDisplayName(normalizedPath),
  };
}

export function getPathDisplayName(path: string | undefined): string {
  const normalized = nonEmpty(path);
  if (!normalized) {
    return '';
  }
  return normalized.split(/[/\\]/).filter(Boolean).pop() ?? normalized;
}

export function getTodoTaskDependencyIds(
  context: { dependencyTaskIds?: readonly string[] } | undefined,
  excludedTaskId?: string
): string[] {
  const excluded = nonEmpty(excludedTaskId);
  return dedupeStringRefs(context?.dependencyTaskIds).filter(
    (dependencyTaskId) => dependencyTaskId !== excluded
  );
}

export function getTodoTaskApprovalState(
  context: { executionGate?: TodoTaskExecutionGate } | undefined
): TodoTaskApprovalState {
  const executionGate = normalizeTodoTaskExecutionGate(context?.executionGate);
  if (!executionGate?.requiresApproval) {
    return 'none';
  }

  return typeof executionGate.approvedAt === 'number' ? 'approved' : 'pending';
}

export function buildApprovedTodoTaskContext(
  context: TodoTaskContext | undefined,
  approvedAt: number
): TodoTaskContext {
  return {
    ...(context ?? {}),
    executionGate: {
      requiresApproval: true,
      approvedAt,
    },
  };
}

export function hasTodoTaskContext(context: TodoTaskContext | undefined): boolean {
  return Boolean(
    nonEmpty(context?.repoPath) ||
      nonEmpty(context?.worktreePath) ||
      getTodoTaskDependencyIds(context).length > 0 ||
      getTodoTaskApprovalState(context) !== 'none' ||
      dedupePathRefs(context?.files).length > 0 ||
      dedupePathRefs(context?.directories).length > 0
  );
}

export function buildTodoTaskExecutionContext(
  task: Pick<TodoTask, 'context'>,
  fallback: TodoTaskContextFallback = {}
): TodoTaskContext | undefined {
  const context = task.context;
  const files = dedupePathRefs(context?.files ?? fallback.files);
  const directories = dedupePathRefs(context?.directories ?? fallback.directories);
  const dependencyTaskIds = getTodoTaskDependencyIds({
    dependencyTaskIds: context?.dependencyTaskIds ?? fallback.dependencyTaskIds,
  });
  const executionGate = normalizeTodoTaskExecutionGate(context?.executionGate);
  const next: TodoTaskContext = {};

  const repoPath = nonEmpty(context?.repoPath) ?? nonEmpty(fallback.repoPath);
  const worktreePath = nonEmpty(context?.worktreePath) ?? nonEmpty(fallback.worktreePath);

  if (repoPath) {
    next.repoPath = repoPath;
  }
  if (worktreePath) {
    next.worktreePath = worktreePath;
  }
  if (dependencyTaskIds.length > 0) {
    next.dependencyTaskIds = dependencyTaskIds;
  }
  if (executionGate) {
    next.executionGate = executionGate;
  }
  if (files.length > 0) {
    next.files = files;
  }
  if (directories.length > 0) {
    next.directories = directories;
  }

  return hasTodoTaskContext(next) ? next : undefined;
}

export function buildTodoTaskContextBlock(context: TodoTaskContext | undefined): string {
  if (!hasTodoTaskContext(context)) {
    return '';
  }

  const lines = ['---', '[TASK CONTEXT]'];
  const repoPath = nonEmpty(context?.repoPath);
  const worktreePath = nonEmpty(context?.worktreePath);
  const dependencyTaskIds = getTodoTaskDependencyIds(context);
  const approvalState = getTodoTaskApprovalState(context);
  const files = dedupePathRefs(context?.files);
  const directories = dedupePathRefs(context?.directories);

  if (repoPath) {
    lines.push(`Repository: ${repoPath}`);
  }
  if (worktreePath) {
    lines.push(`Worktree: ${worktreePath}`);
  }
  if (dependencyTaskIds.length > 0) {
    lines.push('Task dependencies:');
    for (const dependencyTaskId of dependencyTaskIds) {
      lines.push(`- ${dependencyTaskId}`);
    }
  }
  if (approvalState !== 'none') {
    lines.push('Execution gates:');
    lines.push(`- Manual approval: ${approvalState}`);
  }
  if (files.length > 0) {
    lines.push('Related files:');
    for (const file of files) {
      const label = file.label && file.label !== file.path ? ` (${file.label})` : '';
      lines.push(`- ${file.path}${label}`);
    }
  }
  if (directories.length > 0) {
    lines.push('Related directories:');
    for (const directory of directories) {
      const label =
        directory.label && directory.label !== directory.path ? ` (${directory.label})` : '';
      lines.push(`- ${directory.path}${label}`);
    }
  }

  return lines.join('\n');
}

export function buildTodoTaskPrompt(
  title: string,
  description?: string,
  context?: TodoTaskContext
): string {
  const contextBlock = buildTodoTaskContextBlock(context);
  return `
${title}

${description || ''}
${contextBlock ? `\n\n${contextBlock}` : ''}
`.trim();
}
