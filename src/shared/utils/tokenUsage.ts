import type {
  GetProjectTokenUsageRequest,
  NormalizedProjectTokenUsageRequest,
} from '../types/tokenUsage';

export function normalizeProjectTokenUsageRequest(
  request: GetProjectTokenUsageRequest = {}
): NormalizedProjectTokenUsageRequest {
  const projectPathAliases = Object.entries(request.projectPathAliases ?? {}).reduce<
    Record<string, string[]>
  >((aliases, [projectPath, aliasPaths]) => {
    aliases[projectPath] = [...aliasPaths];
    return aliases;
  }, {});

  return {
    includeSessions: request.includeSessions ?? false,
    projectPathAliases,
    projectPaths: request.projectPaths ?? [],
  };
}

export function createProjectTokenUsageRequestKey(
  request: GetProjectTokenUsageRequest = {}
): string {
  return JSON.stringify(normalizeProjectTokenUsageRequest(request));
}
