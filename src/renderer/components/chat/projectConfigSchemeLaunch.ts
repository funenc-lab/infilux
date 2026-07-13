import type {
  ClaudePolicyConfig,
  ClaudeProjectPolicy,
  ClaudeWorktreePolicy,
  ProjectConfigScheme,
  ProjectConfigSchemeSelection,
  PromptPreset,
  WorktreeConfigSchemeSelection,
} from '@shared/types';
import {
  resolveProjectConfigSchemePolicy,
  resolveProjectConfigSchemePromptPresetId,
} from '@shared/types';
import { isRemoteVirtualPath } from '@shared/utils/remotePath';
import { normalizeWorkspaceKey } from '@shared/utils/workspace';

interface ResolveProjectConfigSchemeLaunchStateParams {
  repoPath: string;
  worktreePath: string;
  schemes: ProjectConfigScheme[];
  promptPresets: PromptPreset[];
  repositorySelection: ProjectConfigSchemeSelection | null;
  worktreeSelection: WorktreeConfigSchemeSelection | null;
  directProjectPolicy: ClaudeProjectPolicy | null;
  directWorktreePolicy: ClaudeWorktreePolicy | null;
  existingInitialPrompt?: string | null;
  applySchemePrompt?: boolean;
}

export interface ResolvedProjectConfigSchemeLaunchState {
  projectPolicy: ClaudeProjectPolicy | null;
  worktreePolicy: ClaudeWorktreePolicy | null;
  initialPrompt: string | null;
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

function findPromptContent(
  promptPresets: PromptPreset[],
  promptPresetId: string | null
): string | null {
  if (!promptPresetId) {
    return null;
  }

  const prompt = promptPresets.find((preset) => preset.id === promptPresetId);
  const content = prompt?.content.trim();
  return content ? (prompt?.content ?? null) : null;
}

function isWorktreeSelectionForRepository(
  repoPath: string,
  selection: WorktreeConfigSchemeSelection | null
): boolean {
  if (!selection) {
    return false;
  }

  if (isRemoteVirtualPath(repoPath) || isRemoteVirtualPath(selection.repoPath)) {
    return selection.repoPath === normalizeWorkspaceKey(repoPath, 'linux');
  }

  return (
    selection.repoPath === normalizeWorkspaceKey(repoPath, 'linux') ||
    selection.repoPath === normalizeWorkspaceKey(repoPath, 'darwin') ||
    selection.repoPath === normalizeWorkspaceKey(repoPath, 'win32')
  );
}

export function resolveProjectConfigSchemeLaunchState({
  repoPath,
  worktreePath,
  schemes,
  promptPresets,
  repositorySelection,
  worktreeSelection,
  directProjectPolicy,
  directWorktreePolicy,
  existingInitialPrompt,
  applySchemePrompt = true,
}: ResolveProjectConfigSchemeLaunchStateParams): ResolvedProjectConfigSchemeLaunchState {
  const effectiveWorktreeSelection = isWorktreeSelectionForRepository(repoPath, worktreeSelection)
    ? worktreeSelection
    : null;
  const projectPolicy = toProjectPolicy(
    repoPath,
    resolveProjectConfigSchemePolicy({
      schemes,
      selectedSchemeId: repositorySelection?.schemeId ?? null,
      directPolicy: directProjectPolicy,
    })
  );
  const worktreePolicy = toWorktreePolicy(
    repoPath,
    worktreePath,
    resolveProjectConfigSchemePolicy({
      schemes,
      selectedSchemeId: effectiveWorktreeSelection?.schemeId ?? null,
      directPolicy: directWorktreePolicy,
    })
  );

  const preservedPrompt = existingInitialPrompt?.trim() ? existingInitialPrompt : null;
  const promptPresetId = resolveProjectConfigSchemePromptPresetId({
    schemes,
    repositorySchemeId: repositorySelection?.schemeId ?? null,
    worktreeSchemeId: effectiveWorktreeSelection?.schemeId ?? null,
  });

  return {
    projectPolicy,
    worktreePolicy,
    initialPrompt:
      preservedPrompt ??
      (applySchemePrompt ? findPromptContent(promptPresets, promptPresetId) : null),
  };
}
