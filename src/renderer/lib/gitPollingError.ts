export type GitPollingErrorKind =
  | 'invalid-workdir'
  | 'not-git-repository'
  | 'runtime-restart-required'
  | 'transient'
  | 'generic';

const INVALID_WORKDIR_PATTERNS = [
  /\binvalid workdir:\s*path does not exist or is not a directory\b/i,
];

const NOT_GIT_REPOSITORY_PATTERNS = [
  /\binvalid workdir:\s*not a git repository\b/i,
  /\bnot a git repository\b/i,
];

const RUNTIME_RESTART_GIT_FAILURE_PATTERNS = [/\bspawn\s+EBADF\b/i];

const TRANSIENT_GIT_FAILURE_PATTERNS = [
  /\bspawn\s+(EAGAIN|EMFILE|ENFILE|EPIPE)\b/i,
  /\b(ECONNRESET|ETIMEDOUT)\b/i,
];

function matchesAnyPattern(message: string, patterns: readonly RegExp[]) {
  return patterns.some((pattern) => pattern.test(message));
}

export function normalizeGitPollingErrorMessage(error: unknown): string {
  let message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : 'Git query failed';

  while (message.startsWith('Error: ')) {
    message = message.slice('Error: '.length);
  }

  const normalized = message.trim();
  return normalized.length > 0 ? normalized : 'Git query failed';
}

export function classifyGitPollingError(error: unknown): GitPollingErrorKind {
  const message = normalizeGitPollingErrorMessage(error);

  if (matchesAnyPattern(message, INVALID_WORKDIR_PATTERNS)) {
    return 'invalid-workdir';
  }

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

export function shouldRetryGitPollingError(failureCount: number, error: unknown): boolean {
  return classifyGitPollingError(error) === 'transient' && failureCount < 2;
}

export function shouldStopGitPolling(error: unknown): boolean {
  const kind = classifyGitPollingError(error);
  return (
    kind === 'invalid-workdir' ||
    kind === 'not-git-repository' ||
    kind === 'runtime-restart-required'
  );
}

export function resolveGitPollingInterval(
  error: unknown,
  defaultInterval: number,
  transientInterval: number
): number | false {
  if (shouldStopGitPolling(error)) {
    return false;
  }

  if (classifyGitPollingError(error) === 'transient') {
    return transientInterval;
  }

  return defaultInterval;
}
