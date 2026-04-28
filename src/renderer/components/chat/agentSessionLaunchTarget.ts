export interface AgentSessionLaunchTarget {
  groupId?: string;
  repoPath?: string;
  worktreePath?: string;
}

export interface ResolveAgentSessionLaunchTargetOptions {
  currentRepoPath: string;
  currentWorktreePath: string;
  sessionOverrides?: {
    cwd?: string;
    repoPath?: string;
  };
  target?: string | AgentSessionLaunchTarget;
}

export interface ResolvedAgentSessionLaunchTarget {
  groupId?: string;
  repoPath: string;
  worktreePath: string;
}

export function normalizeAgentSessionLaunchTarget(
  target?: string | AgentSessionLaunchTarget
): AgentSessionLaunchTarget {
  if (typeof target === 'string') {
    return { groupId: target };
  }

  return target ?? {};
}

export function resolveAgentSessionLaunchTarget({
  currentRepoPath,
  currentWorktreePath,
  sessionOverrides = {},
  target,
}: ResolveAgentSessionLaunchTargetOptions): ResolvedAgentSessionLaunchTarget {
  const normalizedTarget = normalizeAgentSessionLaunchTarget(target);

  return {
    groupId: normalizedTarget.groupId,
    repoPath: sessionOverrides.repoPath ?? normalizedTarget.repoPath ?? currentRepoPath,
    worktreePath: sessionOverrides.cwd ?? normalizedTarget.worktreePath ?? currentWorktreePath,
  };
}
