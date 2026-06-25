import type { ClaudeCapabilityCatalogItem } from '@shared/types';
import { isRemoteVirtualPath, parseRemoteVirtualPath } from '@shared/utils/remotePath';

const WORKSPACE_NATIVE_SKILL_ROOTS = ['.claude', '.agents'] as const;
const NATIVE_SKILL_FILE_SUFFIX = '/SKILL.md';

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
  const nativeSkillRoots = WORKSPACE_NATIVE_SKILL_ROOTS.map(
    (rootName) => `${comparableWorktreePath.path}/${rootName}/skills/`
  );

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
    const nativeSkillRoot = nativeSkillRoots.find((rootPath) =>
      normalizedSourcePath.startsWith(rootPath)
    );
    if (!nativeSkillRoot || !normalizedSourcePath.endsWith(NATIVE_SKILL_FILE_SUFFIX)) {
      return false;
    }

    const skillName = normalizedSourcePath.slice(
      nativeSkillRoot.length,
      -NATIVE_SKILL_FILE_SUFFIX.length
    );
    return Boolean(skillName) && !skillName.includes('/');
  });
}
