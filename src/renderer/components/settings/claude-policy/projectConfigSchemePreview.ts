import type {
  ClaudePolicyConfig,
  ClaudeProjectPolicy,
  ClaudeWorktreePolicy,
  ProjectConfigScheme,
} from '@shared/types';
import { resolveProjectConfigSchemePolicy } from '@shared/types';

interface ResolveProjectConfigSchemePreviewPoliciesParams {
  repoPath: string;
  worktreePath: string;
  schemes: ProjectConfigScheme[];
  repositorySchemeId?: string | null;
  worktreeSchemeId?: string | null;
  projectPolicy: ClaudePolicyConfig | null;
  worktreePolicy: ClaudePolicyConfig | null;
}

interface ResolvedProjectConfigSchemePreviewPolicies {
  projectPolicy: ClaudeProjectPolicy | null;
  worktreePolicy: ClaudeWorktreePolicy | null;
}

function toProjectPolicy(
  repoPath: string,
  policy: ClaudePolicyConfig | null
): ClaudeProjectPolicy | null {
  if (!policy) {
    return null;
  }

  return {
    repoPath,
    ...policy,
  };
}

function toWorktreePolicy(
  repoPath: string,
  worktreePath: string,
  policy: ClaudePolicyConfig | null
): ClaudeWorktreePolicy | null {
  if (!policy) {
    return null;
  }

  return {
    repoPath,
    worktreePath,
    ...policy,
  };
}

export function resolveProjectConfigSchemePreviewPolicies({
  repoPath,
  worktreePath,
  schemes,
  repositorySchemeId,
  worktreeSchemeId,
  projectPolicy,
  worktreePolicy,
}: ResolveProjectConfigSchemePreviewPoliciesParams): ResolvedProjectConfigSchemePreviewPolicies {
  return {
    projectPolicy: toProjectPolicy(
      repoPath,
      resolveProjectConfigSchemePolicy({
        schemes,
        selectedSchemeId: repositorySchemeId,
        directPolicy: projectPolicy,
      })
    ),
    worktreePolicy: toWorktreePolicy(
      repoPath,
      worktreePath,
      resolveProjectConfigSchemePolicy({
        schemes,
        selectedSchemeId: worktreeSchemeId,
        directPolicy: worktreePolicy,
      })
    ),
  };
}
