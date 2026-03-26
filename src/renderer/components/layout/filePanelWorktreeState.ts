import { normalizePath } from '@/App/storage';

interface WorktreeFileTabsState {
  tabs: Array<{ path: string }>;
}

interface GetFileTabCountForWorktreeOptions {
  targetWorktreePath: string;
  currentWorktreePath: string | null;
  currentTabCount: number;
  worktreeStates: Record<string, WorktreeFileTabsState>;
}

export function getFileTabCountForWorktree({
  targetWorktreePath,
  currentWorktreePath,
  currentTabCount,
  worktreeStates,
}: GetFileTabCountForWorktreeOptions): number {
  const normalizedTargetPath = normalizePath(targetWorktreePath);

  if (currentWorktreePath && normalizePath(currentWorktreePath) === normalizedTargetPath) {
    return currentTabCount;
  }

  const matchingEntry = Object.entries(worktreeStates).find(
    ([path]) => normalizePath(path) === normalizedTargetPath
  );

  return matchingEntry?.[1].tabs.length ?? 0;
}
