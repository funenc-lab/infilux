import type { NormalizedProjectTokenUsageRequest } from '@shared/types/tokenUsage';

export function normalizeUsagePath(value: string): string {
  const normalized = value.replace(/\\/g, '/').replace(/\/+$/g, '');
  return normalized || '/';
}

export function isSameOrChildUsagePath(candidatePath: string, projectPath: string): boolean {
  const candidate = normalizeUsagePath(candidatePath);
  const project = normalizeUsagePath(projectPath);
  return candidate === project || candidate.startsWith(`${project}/`);
}

export function getProjectScopePaths(
  projectPath: string,
  request: NormalizedProjectTokenUsageRequest
): string[] {
  return [projectPath, ...(request.projectPathAliases[projectPath] ?? [])];
}

export function getAllProjectScopePaths(request: NormalizedProjectTokenUsageRequest): string[] {
  return request.projectPaths.flatMap((projectPath) => getProjectScopePaths(projectPath, request));
}

export function shouldIncludeUsageCwd(
  cwd: string,
  request: NormalizedProjectTokenUsageRequest | undefined
): boolean {
  if (!request?.projectPaths.length) {
    return true;
  }

  return getAllProjectScopePaths(request).some((scopePath) =>
    isSameOrChildUsagePath(cwd, scopePath)
  );
}
