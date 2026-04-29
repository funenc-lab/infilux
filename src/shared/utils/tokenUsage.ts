import type { GetProjectTokenUsageRequest } from '../types/tokenUsage';

export interface NormalizedProjectTokenUsageRequest {
  includeSessions: boolean;
  projectPaths: string[];
}

export function normalizeProjectTokenUsageRequest(
  request: GetProjectTokenUsageRequest = {}
): NormalizedProjectTokenUsageRequest {
  return {
    includeSessions: request.includeSessions ?? false,
    projectPaths: request.projectPaths ?? [],
  };
}

export function createProjectTokenUsageRequestKey(
  request: GetProjectTokenUsageRequest = {}
): string {
  return JSON.stringify(normalizeProjectTokenUsageRequest(request));
}
