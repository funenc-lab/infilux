import type { ClaudeIdeBridgeStatus } from '@shared/types';

function normalizeWorkspacePathForComparison(input: string): string {
  const normalized = input.replace(/\\/g, '/').replace(/\/+$/, '');
  return process.platform === 'win32' || process.platform === 'darwin'
    ? normalized.toLowerCase()
    : normalized;
}

export function matchesClaudeIdeWorkspace(workspacePath: string, candidateFolder: string): boolean {
  const workspace = normalizeWorkspacePathForComparison(workspacePath);
  const candidate = normalizeWorkspacePathForComparison(candidateFolder);

  return workspace === candidate || workspace.startsWith(`${candidate}/`);
}

export function resolveClaudeIdeBridgeStatus(params: {
  enabled: boolean;
  port: number | null;
  workspaceFolders: string[];
  workspacePath?: string;
  matchingWorkspaceLockCount: number;
}): ClaudeIdeBridgeStatus {
  const { enabled, port, workspaceFolders, workspacePath, matchingWorkspaceLockCount } = params;

  if (!enabled) {
    return {
      enabled: false,
      port,
      workspaceFolders,
      hasMatchingWorkspace: false,
      matchingWorkspaceLockCount,
      canUseIde: false,
      reason: 'bridge-disabled',
    };
  }

  if (!workspacePath) {
    return {
      enabled,
      port,
      workspaceFolders,
      hasMatchingWorkspace: false,
      matchingWorkspaceLockCount,
      canUseIde: true,
      reason: 'no-workspace',
    };
  }

  const hasMatchingWorkspace = workspaceFolders.some((folder) =>
    matchesClaudeIdeWorkspace(workspacePath, folder)
  );

  if (!hasMatchingWorkspace) {
    return {
      enabled,
      port,
      workspaceFolders,
      hasMatchingWorkspace,
      matchingWorkspaceLockCount,
      canUseIde: false,
      reason: 'workspace-mismatch',
    };
  }

  if (matchingWorkspaceLockCount === 0) {
    return {
      enabled,
      port,
      workspaceFolders,
      hasMatchingWorkspace,
      matchingWorkspaceLockCount,
      canUseIde: false,
      reason: 'no-live-lock',
    };
  }

  if (matchingWorkspaceLockCount > 1) {
    return {
      enabled,
      port,
      workspaceFolders,
      hasMatchingWorkspace,
      matchingWorkspaceLockCount,
      canUseIde: false,
      reason: 'ambiguous-locks',
    };
  }

  return {
    enabled,
    port,
    workspaceFolders,
    hasMatchingWorkspace,
    matchingWorkspaceLockCount,
    canUseIde: true,
    reason: 'ready',
  };
}
