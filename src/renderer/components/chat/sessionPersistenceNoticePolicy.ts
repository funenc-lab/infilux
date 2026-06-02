export interface SessionPersistenceNoticePolicyInput {
  isRemoteRepo: boolean;
  platform?: string;
  tmuxEnabled: boolean;
  tmuxInstalled: boolean | null;
  hasRecoveryRequiredSession?: boolean;
}

export type SessionPersistenceNoticeKind = 'tmux-disabled' | 'recovery-required';

export interface SessionPersistenceNoticeDismissKeyInput {
  kind: SessionPersistenceNoticeKind | null;
  repoPath?: string | null;
  worktreePath?: string | null;
  recoveryRequiredSessionIds?: readonly string[];
}

export function resolveSessionPersistenceNoticeKind({
  isRemoteRepo,
  platform,
  tmuxEnabled,
  tmuxInstalled,
  hasRecoveryRequiredSession = false,
}: SessionPersistenceNoticePolicyInput): SessionPersistenceNoticeKind | null {
  if (!isRemoteRepo && hasRecoveryRequiredSession) {
    return 'recovery-required';
  }

  if (isRemoteRepo || platform === 'win32' || tmuxEnabled) {
    return null;
  }

  return tmuxInstalled === true ? 'tmux-disabled' : null;
}

export function shouldShowSessionPersistenceNotice(
  input: SessionPersistenceNoticePolicyInput
): boolean {
  return resolveSessionPersistenceNoticeKind(input) !== null;
}

export function buildSessionPersistenceNoticeDismissKey({
  kind,
  repoPath,
  worktreePath,
  recoveryRequiredSessionIds = [],
}: SessionPersistenceNoticeDismissKeyInput): string | null {
  if (!kind || !repoPath || !worktreePath) {
    return null;
  }

  const scopeKey = `${repoPath}::${worktreePath}`;
  if (kind === 'recovery-required') {
    const sessionKey = [...new Set(recoveryRequiredSessionIds)].sort().join(',');
    return sessionKey ? `${kind}:${scopeKey}:${sessionKey}` : null;
  }

  return `${kind}:${scopeKey}`;
}
