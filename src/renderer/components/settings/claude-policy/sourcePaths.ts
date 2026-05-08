import type { ClaudeCapabilityCatalogItem } from '@shared/types';
import { isRemoteVirtualPath, parseRemoteVirtualPath } from '@shared/utils/remotePath';

export function getCapabilitySourcePaths(item: {
  sourcePath?: ClaudeCapabilityCatalogItem['sourcePath'];
  sourcePaths?: ClaudeCapabilityCatalogItem['sourcePaths'];
}): string[] {
  return [
    ...new Set([...(item.sourcePaths ?? []), ...(item.sourcePath ? [item.sourcePath] : [])]),
  ].sort((left, right) => left.localeCompare(right));
}

function normalizeComparablePath(inputPath: string): {
  connectionId?: string;
  isRemote: boolean;
  path: string;
} {
  if (isRemoteVirtualPath(inputPath)) {
    const parsedPath = parseRemoteVirtualPath(inputPath);
    return {
      connectionId: parsedPath.connectionId,
      isRemote: true,
      path: parsedPath.remotePath.replace(/\\/g, '/').replace(/\/+$/, ''),
    };
  }

  return {
    isRemote: false,
    path: inputPath.replace(/\\/g, '/').replace(/\/+$/, ''),
  };
}

export function getWorkspaceNativeClaudeSkillSourcePaths(
  item: {
    sourcePath?: ClaudeCapabilityCatalogItem['sourcePath'];
    sourcePaths?: ClaudeCapabilityCatalogItem['sourcePaths'];
  },
  worktreePath: string
): string[] {
  const comparableWorktreePath = normalizeComparablePath(worktreePath);
  const nativeSkillRoot = `${comparableWorktreePath.path}/.claude/skills/`;
  const nativeSkillFileSuffix = '/SKILL.md';

  return getCapabilitySourcePaths(item).filter((sourcePath) => {
    const comparableSourcePath = normalizeComparablePath(sourcePath);
    if (
      comparableWorktreePath.isRemote !== comparableSourcePath.isRemote &&
      !comparableWorktreePath.isRemote
    ) {
      return false;
    }
    if (
      comparableWorktreePath.connectionId &&
      comparableSourcePath.connectionId &&
      comparableWorktreePath.connectionId !== comparableSourcePath.connectionId
    ) {
      return false;
    }

    const normalizedSourcePath = comparableSourcePath.path;
    if (
      !normalizedSourcePath.startsWith(nativeSkillRoot) ||
      !normalizedSourcePath.endsWith(nativeSkillFileSuffix)
    ) {
      return false;
    }

    const skillName = normalizedSourcePath.slice(
      nativeSkillRoot.length,
      -nativeSkillFileSuffix.length
    );
    return Boolean(skillName) && !skillName.includes('/');
  });
}
