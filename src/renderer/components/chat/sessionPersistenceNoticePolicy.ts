export interface SessionPersistenceNoticePolicyInput {
  isRemoteRepo: boolean;
  platform?: string;
  tmuxEnabled: boolean;
  tmuxInstalled: boolean | null;
}

export function shouldShowSessionPersistenceNotice({
  isRemoteRepo,
  platform,
  tmuxEnabled,
  tmuxInstalled,
}: SessionPersistenceNoticePolicyInput): boolean {
  if (isRemoteRepo || platform === 'win32' || tmuxEnabled) {
    return false;
  }

  return tmuxInstalled === true;
}
