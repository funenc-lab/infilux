import type { GitWorktree } from '@shared/types';
import { sanitizeGitWorktrees } from './worktreeData';

export type WorktreeLoadErrorKind =
  | 'not-git-repository'
  | 'runtime-restart-required'
  | 'transient'
  | 'generic';

const NOT_GIT_REPOSITORY_PATTERNS = [
  /\bnot a git repository\b/i,
  /\binvalid workdir:\s*not a git repository\b/i,
];

const RUNTIME_RESTART_GIT_FAILURE_PATTERNS = [/\bspawn\s+EBADF\b/i];

const TRANSIENT_GIT_FAILURE_PATTERNS = [
  /\bspawn\s+(EAGAIN|EMFILE|ENFILE|EPIPE)\b/i,
  /\b(ECONNRESET|ETIMEDOUT)\b/i,
];

function matchesAnyPattern(message: string, patterns: readonly RegExp[]) {
  return patterns.some((pattern) => pattern.test(message));
}

export function normalizeWorktreeLoadErrorMessage(error: unknown): string {
  let message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Failed to load worktrees';

  while (message.startsWith('Error: ')) {
    message = message.slice('Error: '.length);
  }

  const normalized = message.trim();
  return normalized.length > 0 ? normalized : 'Failed to load worktrees';
}

export function classifyWorktreeLoadError(error: unknown): WorktreeLoadErrorKind {
  const message = normalizeWorktreeLoadErrorMessage(error);

  if (matchesAnyPattern(message, NOT_GIT_REPOSITORY_PATTERNS)) {
    return 'not-git-repository';
  }

  if (matchesAnyPattern(message, RUNTIME_RESTART_GIT_FAILURE_PATTERNS)) {
    return 'runtime-restart-required';
  }

  if (matchesAnyPattern(message, TRANSIENT_GIT_FAILURE_PATTERNS)) {
    return 'transient';
  }

  return 'generic';
}

export function shouldRetryWorktreeLoadError(failureCount: number, error: unknown): boolean {
  return classifyWorktreeLoadError(error) === 'transient' && failureCount < 2;
}

export function canRecoverWorktreeListFromPreviousSnapshot(
  error: unknown,
  previousWorktrees: readonly GitWorktree[] = []
): boolean {
  const kind = classifyWorktreeLoadError(error);
  return (
    (kind === 'transient' || kind === 'runtime-restart-required') &&
    sanitizeGitWorktrees(previousWorktrees).length > 0
  );
}
