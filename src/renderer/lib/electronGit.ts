import type { GitAutoFetchCompletedPayload } from '@shared/types';

interface RendererGitApi {
  onAutoFetchCompleted?: (
    callback: (data: GitAutoFetchCompletedPayload) => void
  ) => (() => void) | undefined;
  setAutoFetchEnabled?: (enabled: boolean) => Promise<void>;
}

const noopCleanup = () => {};

function getRendererGitApi(): RendererGitApi | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.electronAPI?.git ?? null;
}

export function onGitAutoFetchCompleted(
  callback: (data: GitAutoFetchCompletedPayload) => void
): () => void {
  const git = getRendererGitApi();
  if (!git?.onAutoFetchCompleted) {
    return noopCleanup;
  }

  const cleanup = git.onAutoFetchCompleted(callback);
  return typeof cleanup === 'function' ? cleanup : noopCleanup;
}

export async function setRendererGitAutoFetchEnabled(enabled: boolean): Promise<void> {
  const git = getRendererGitApi();
  if (!git?.setAutoFetchEnabled) {
    return;
  }

  await git.setAutoFetchEnabled(enabled);
}
