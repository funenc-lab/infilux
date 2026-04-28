import type {
  TodoTask,
  TodoTaskContext,
  TodoTaskContextDirectory,
  TodoTaskContextFile,
} from './types';

export interface TodoTaskContextFallback {
  repoPath?: string;
  worktreePath?: string;
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

export function hasTodoTaskContext(context: TodoTaskContext | undefined): boolean {
  return Boolean(
    nonEmpty(context?.repoPath) ||
      nonEmpty(context?.worktreePath) ||
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
  const next: TodoTaskContext = {};

  const repoPath = nonEmpty(context?.repoPath) ?? nonEmpty(fallback.repoPath);
  const worktreePath = nonEmpty(context?.worktreePath) ?? nonEmpty(fallback.worktreePath);

  if (repoPath) {
    next.repoPath = repoPath;
  }
  if (worktreePath) {
    next.worktreePath = worktreePath;
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
  const files = dedupePathRefs(context?.files);
  const directories = dedupePathRefs(context?.directories);

  if (repoPath) {
    lines.push(`Repository: ${repoPath}`);
  }
  if (worktreePath) {
    lines.push(`Worktree: ${worktreePath}`);
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
