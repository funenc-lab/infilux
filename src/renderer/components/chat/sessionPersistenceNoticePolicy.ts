export interface SessionPersistenceNoticePolicyInput {
  isRemoteRepo: boolean;
  platform?: string;
  tmuxEnabled: boolean;
  tmuxInstalled: boolean | null;
  hasRecoveryRequiredSession?: boolean;
}

export type SessionPersistenceNoticeKind = 'tmux-disabled' | 'recovery-required';

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
