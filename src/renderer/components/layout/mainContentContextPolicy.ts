import { normalizePath } from '@/App/storage';

export interface MainContentContext {
  repoPath: string;
  worktreePath: string;
}

interface ResolveMainContentContextOptions {
  repoPath?: string;
  worktreePath?: string;
  sourceControlRootPath?: string;
  reviewRootPath?: string;
  openInPath?: string;
  lastValidContext?: MainContentContext | null;
}

interface ResolveMainContentContextResult {
  hasActiveWorktree: boolean;
  currentRepoPath: string | null;
  currentWorktreePath: string | null;
  currentNormalizedWorktreePath: string | null;
  retainedChatContext: MainContentContext | null;
  sourceControlRootPath: string | null;
  reviewRootPath: string | null;
  openInPath: string | null;
}

export function resolveMainContentContext({
  repoPath,
  worktreePath,
  sourceControlRootPath,
  reviewRootPath,
  openInPath,
  lastValidContext = null,
}: ResolveMainContentContextOptions): ResolveMainContentContextResult {
  const hasActiveWorktree = Boolean(repoPath && worktreePath);
  const currentRepoPath = hasActiveWorktree ? repoPath : null;
  const currentWorktreePath = hasActiveWorktree ? worktreePath : null;

  return {
    hasActiveWorktree,
    currentRepoPath: currentRepoPath ?? null,
    currentWorktreePath: currentWorktreePath ?? null,
    currentNormalizedWorktreePath: currentWorktreePath ? normalizePath(currentWorktreePath) : null,
    retainedChatContext: hasActiveWorktree
      ? { repoPath: repoPath as string, worktreePath: worktreePath as string }
      : (lastValidContext ?? null),
    sourceControlRootPath: sourceControlRootPath ?? currentWorktreePath ?? null,
    reviewRootPath: reviewRootPath ?? currentWorktreePath ?? null,
    openInPath: openInPath ?? currentWorktreePath ?? null,
  };
}
