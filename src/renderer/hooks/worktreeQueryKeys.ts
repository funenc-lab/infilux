export const worktreeQueryKeys = {
  all: () => ['worktree'] as const,
  lists: () => ['worktree', 'list'] as const,
  list: (workdir: string | null) => ['worktree', 'list', workdir] as const,
  mergeState: (workdir: string | null) => ['worktree', 'mergeState', workdir] as const,
  conflicts: (workdir: string | null) => ['worktree', 'conflicts', workdir] as const,
  conflictContent: (workdir: string | null, filePath: string | null) =>
    ['worktree', 'conflictContent', workdir, filePath] as const,
};
