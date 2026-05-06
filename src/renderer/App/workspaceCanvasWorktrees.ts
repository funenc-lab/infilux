import type { AgentCanvasWorktreeCandidate } from '@/components/chat/agentCanvasSessionScope';
import { TEMP_REPO_ID } from './constants';
import { normalizePath } from './storage';

export interface WorkspaceCanvasRepositoryCandidate {
  path: string;
}

export interface WorkspaceCanvasSessionCandidate {
  cwd: string;
  repoPath: string;
}

interface ResolveWorkspaceCanvasWorktreesOptions {
  activeWorktreePath?: string | null;
  mainContentRepoPath: string | null;
  repositories: WorkspaceCanvasRepositoryCandidate[];
  repoWorktreeMap: Record<string, string>;
  sessions?: WorkspaceCanvasSessionCandidate[];
}

export function resolveWorkspaceCanvasWorktrees({
  activeWorktreePath,
  mainContentRepoPath,
  repositories,
  repoWorktreeMap,
  sessions = [],
}: ResolveWorkspaceCanvasWorktreesOptions): AgentCanvasWorktreeCandidate[] {
  const repositoryPathKeys = new Set(
    repositories.map((repository) => normalizePath(repository.path))
  );
  const worktreesByKey = new Map<string, AgentCanvasWorktreeCandidate>();

  const addWorktree = (
    repoPath: string | null | undefined,
    worktreePath: string | null | undefined
  ) => {
    if (!repoPath || !worktreePath) {
      return;
    }

    const normalizedRepoPath = normalizePath(repoPath);
    if (repoPath !== TEMP_REPO_ID && !repositoryPathKeys.has(normalizedRepoPath)) {
      return;
    }

    const groupKey = `${normalizedRepoPath}::${normalizePath(worktreePath)}`;
    if (worktreesByKey.has(groupKey)) {
      return;
    }

    worktreesByKey.set(groupKey, {
      repoPath,
      worktreePath,
    });
  };

  for (const [repoPath, worktreePath] of Object.entries(repoWorktreeMap)) {
    addWorktree(repoPath, worktreePath);
  }

  addWorktree(mainContentRepoPath, activeWorktreePath);

  for (const session of sessions) {
    addWorktree(session.repoPath, session.cwd);
  }

  return Array.from(worktreesByKey.values());
}
