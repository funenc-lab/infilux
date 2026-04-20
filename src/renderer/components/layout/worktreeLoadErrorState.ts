import {
  classifyWorktreeLoadError,
  normalizeWorktreeLoadErrorMessage,
  type WorktreeLoadErrorKind,
} from '@/lib/worktreeLoadError';

export interface WorktreeLoadErrorState {
  kind: WorktreeLoadErrorKind;
  tone: 'danger' | 'warning';
  label: string;
  title: string;
  description: string;
  inlineDescription: string;
  status: string;
  nextStep: string;
  detail: string;
}

export function resolveWorktreeLoadErrorState(
  error: string | null | undefined
): WorktreeLoadErrorState | null {
  if (!error) {
    return null;
  }

  const detail = normalizeWorktreeLoadErrorMessage(error);
  const kind = classifyWorktreeLoadError(detail);

  switch (kind) {
    case 'not-git-repository':
      return {
        kind,
        tone: 'danger',
        label: 'Repository Required',
        title: 'Not a Git repository',
        description:
          'This directory is not a Git repository. Initialize it to enable branches, worktrees, and source-control workflows.',
        inlineDescription: 'Initialize Git here to create and manage worktrees.',
        status: 'Git metadata not found',
        nextStep: 'Refresh or initialize the repository',
        detail,
      };
    case 'transient':
      return {
        kind,
        tone: 'warning',
        label: 'Unavailable',
        title: 'Git temporarily unavailable',
        description:
          'Git commands failed to start for this repository. Infilux will keep the last known worktrees when possible and recover on refresh.',
        inlineDescription:
          'Git commands failed to start. Refresh to retry without reinitializing the repository.',
        status: 'Git process launch failed',
        nextStep: 'Refresh the repository or wait for automatic recovery',
        detail,
      };
    case 'runtime-restart-required':
      return {
        kind,
        tone: 'danger',
        label: 'Restart Required',
        title: 'Restart Infilux to recover Git',
        description:
          'Git process startup failed inside the current Infilux runtime. Fully quit and reopen the app to restore repository features.',
        inlineDescription:
          'Git process startup failed inside Infilux. Fully quit and reopen the app.',
        status: 'Git runtime requires restart',
        nextStep: 'Quit Infilux completely, then reopen it',
        detail,
      };
    default:
      return {
        kind,
        tone: 'warning',
        label: 'Unavailable',
        title: 'Unable to load worktrees',
        description: 'Worktree data could not be loaded for this repository.',
        inlineDescription: 'Worktree data could not be loaded. Refresh to retry.',
        status: 'Worktree query failed',
        nextStep: 'Refresh the repository and try again',
        detail,
      };
  }
}
