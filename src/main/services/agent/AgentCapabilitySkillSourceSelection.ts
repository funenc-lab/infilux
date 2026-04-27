import type { AgentCapabilityProvider, ClaudeCapabilityCatalogItem } from '@shared/types';
import { isRemoteVirtualPath, parseRemoteVirtualPath } from '@shared/utils/remotePath';

const PROVIDER_SKILL_ROOT_PRIORITY: Record<AgentCapabilityProvider, readonly string[]> = {
  claude: ['.claude/skills', '.agents/skills', '.codex/skills', '.gemini/skills'],
  codex: ['.codex/skills', '.agents/skills', '.claude/skills', '.gemini/skills'],
  gemini: ['.gemini/skills', '.agents/skills', '.claude/skills', '.codex/skills'],
};

type SkillSourceScope = 'system' | 'user' | 'project' | 'worktree';

function normalizePathValue(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
}

function resolveWorkspacePath(workspacePath: string): string {
  return isRemoteVirtualPath(workspacePath)
    ? parseRemoteVirtualPath(workspacePath).remotePath
    : workspacePath;
}

function isPathWithinRoot(candidatePath: string, rootPath: string): boolean {
  const normalizedCandidatePath = normalizePathValue(candidatePath);
  const normalizedRootPath = normalizePathValue(rootPath);

  return (
    normalizedCandidatePath === normalizedRootPath ||
    normalizedCandidatePath.startsWith(`${normalizedRootPath}/`)
  );
}

function isSystemSkillPath(filePath: string): boolean {
  return /(^|\/)\.system(\/|$)/.test(normalizePathValue(filePath));
}

function inferSkillSourceScope(
  filePath: string,
  repoPath: string,
  worktreePath: string
): SkillSourceScope {
  if (isSystemSkillPath(filePath)) {
    return 'system';
  }

  if (isPathWithinRoot(filePath, resolveWorkspacePath(worktreePath))) {
    return 'worktree';
  }

  if (isPathWithinRoot(filePath, resolveWorkspacePath(repoPath))) {
    return 'project';
  }

  return 'user';
}

function getCapabilitySourcePaths(capability: ClaudeCapabilityCatalogItem): string[] {
  return [
    ...new Set([
      ...(capability.sourcePaths ?? []),
      ...(capability.sourcePath ? [capability.sourcePath] : []),
    ]),
  ].sort((left, right) => left.localeCompare(right));
}

function getProviderSkillRootPriority(provider: AgentCapabilityProvider, filePath: string): number {
  const normalizedPath = normalizePathValue(filePath);
  const priorities = PROVIDER_SKILL_ROOT_PRIORITY[provider];

  const matchedIndex = priorities.findIndex((skillRoot) =>
    new RegExp(`(^|/)${skillRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:/|$)`).test(
      normalizedPath
    )
  );

  return matchedIndex >= 0 ? matchedIndex : priorities.length;
}

export function selectPreferredSkillSourcePathForProvider(params: {
  provider: AgentCapabilityProvider;
  capability: ClaudeCapabilityCatalogItem;
  repoPath: string;
  worktreePath: string;
}): string | null {
  const sourcePaths = getCapabilitySourcePaths(params.capability);
  if (sourcePaths.length === 0) {
    return null;
  }

  const baselineSourcePath =
    params.capability.sourcePath && sourcePaths.includes(params.capability.sourcePath)
      ? params.capability.sourcePath
      : (sourcePaths[0] ?? null);
  if (!baselineSourcePath) {
    return null;
  }

  const baselineScope = inferSkillSourceScope(
    baselineSourcePath,
    params.repoPath,
    params.worktreePath
  );
  const scopeMatchedSourcePaths = sourcePaths.filter(
    (sourcePath) =>
      inferSkillSourceScope(sourcePath, params.repoPath, params.worktreePath) === baselineScope
  );
  const candidateSourcePaths =
    scopeMatchedSourcePaths.length > 0 ? scopeMatchedSourcePaths : sourcePaths;

  return [...candidateSourcePaths].sort((left, right) => {
    const priorityDelta =
      getProviderSkillRootPriority(params.provider, left) -
      getProviderSkillRootPriority(params.provider, right);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    if (left === baselineSourcePath) {
      return -1;
    }
    if (right === baselineSourcePath) {
      return 1;
    }
    return left.localeCompare(right);
  })[0]!;
}
