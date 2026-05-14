type TranslateFunction = (key: string) => string;

const BRANCH_CONFLICT_PATTERNS = [
  'a branch named',
  'already checked out',
  'is already used by worktree',
  'worktree branch conflicts with existing local branch:',
  'branch already exists',
];

export function resolveCreateWorktreeErrorMessage(error: unknown, t: TranslateFunction): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : t('Failed to create');
  const normalizedMessage = message.toLowerCase();

  if (BRANCH_CONFLICT_PATTERNS.some((pattern) => normalizedMessage.includes(pattern))) {
    return t('Branch already exists. Choose a different name.');
  }

  if (normalizedMessage.includes('already exists')) {
    return t('Worktree path already exists. Choose a different path or branch name.');
  }

  return message;
}
