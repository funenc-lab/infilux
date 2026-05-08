import type {
  GetProjectTokenUsageRequest,
  NormalizedProjectTokenUsageRequest,
  ProjectTokenUsageSnapshot,
  TokenUsageCounts,
  TokenUsageProjectSummary,
  TokenUsageProviderStatus,
  TokenUsageProviderSummary,
  TokenUsageSessionSummary,
} from '@shared/types/tokenUsage';
import { normalizeProjectTokenUsageRequest } from '@shared/utils/tokenUsage';
import {
  getProjectScopePaths,
  isSameOrChildUsagePath,
  normalizeUsagePath,
} from './TokenUsageScope';

export function createEmptyTokenUsageCounts(): TokenUsageCounts {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    cachedInputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
  };
}

export function addTokenUsageCounts(
  left: TokenUsageCounts,
  right: TokenUsageCounts
): TokenUsageCounts {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheCreationInputTokens: left.cacheCreationInputTokens + right.cacheCreationInputTokens,
    cacheReadInputTokens: left.cacheReadInputTokens + right.cacheReadInputTokens,
    cachedInputTokens: left.cachedInputTokens + right.cachedInputTokens,
    reasoningOutputTokens: left.reasoningOutputTokens + right.reasoningOutputTokens,
    totalTokens: left.totalTokens + right.totalTokens,
  };
}

export function buildTokenUsageCounts(input: Partial<TokenUsageCounts>): TokenUsageCounts {
  const counts = {
    ...createEmptyTokenUsageCounts(),
    ...input,
  };

  if (counts.totalTokens <= 0) {
    counts.totalTokens =
      counts.inputTokens +
      counts.outputTokens +
      counts.cacheCreationInputTokens +
      counts.cacheReadInputTokens;
  }

  return counts;
}

function normalizeRequestedProjectPaths(projectPaths: string[] | undefined): string[] {
  const normalizedPaths: string[] = [];
  const seen = new Set<string>();

  for (const projectPath of projectPaths ?? []) {
    const trimmedProjectPath = projectPath.trim();
    if (!trimmedProjectPath) {
      continue;
    }

    const normalizedProjectPath = normalizeUsagePath(trimmedProjectPath);
    if (seen.has(normalizedProjectPath)) {
      continue;
    }

    seen.add(normalizedProjectPath);
    normalizedPaths.push(normalizedProjectPath);
  }

  return normalizedPaths;
}

function findMostSpecificMatchingProjectPath(
  session: TokenUsageSessionSummary,
  request: NormalizedProjectTokenUsageRequest
): string | undefined {
  if (!request.projectPaths.length) {
    return undefined;
  }

  let matchedProject: string | undefined;
  for (const projectPath of request.projectPaths) {
    const matchesProject = getProjectScopePaths(projectPath, request).some(
      (matchPath) =>
        isSameOrChildUsagePath(session.projectPath, matchPath) ||
        isSameOrChildUsagePath(session.cwd, matchPath)
    );
    if (!matchesProject) {
      continue;
    }

    if (!matchedProject || projectPath.length > matchedProject.length) {
      matchedProject = projectPath;
    }
  }

  return matchedProject;
}

function resolveProjectPath(
  session: TokenUsageSessionSummary,
  request: NormalizedProjectTokenUsageRequest
): string {
  if (!request.projectPaths.length) {
    return normalizeUsagePath(session.projectPath || session.cwd);
  }

  const matchedProject = findMostSpecificMatchingProjectPath(session, request);
  return normalizeUsagePath(matchedProject ?? session.projectPath);
}

function shouldIncludeSession(
  session: TokenUsageSessionSummary,
  request: NormalizedProjectTokenUsageRequest
): boolean {
  if (!request.projectPaths.length) {
    return true;
  }

  return findMostSpecificMatchingProjectPath(session, request) !== undefined;
}

function compareProjects(left: TokenUsageProjectSummary, right: TokenUsageProjectSummary): number {
  if (right.totals.totalTokens !== left.totals.totalTokens) {
    return right.totals.totalTokens - left.totals.totalTokens;
  }
  return left.projectPath.localeCompare(right.projectPath);
}

function compareSessions(left: TokenUsageSessionSummary, right: TokenUsageSessionSummary): number {
  if (right.updatedAt !== left.updatedAt) {
    return right.updatedAt - left.updatedAt;
  }
  return left.sessionId.localeCompare(right.sessionId);
}

function compareProviderSummaries(
  left: TokenUsageProviderSummary,
  right: TokenUsageProviderSummary
): number {
  if (right.totals.totalTokens !== left.totals.totalTokens) {
    return right.totals.totalTokens - left.totals.totalTokens;
  }
  return left.label.localeCompare(right.label);
}

export function buildProjectTokenUsageSnapshot(
  sessions: TokenUsageSessionSummary[],
  providerStatuses: TokenUsageProviderStatus[],
  request: GetProjectTokenUsageRequest = {},
  generatedAt = Date.now()
): ProjectTokenUsageSnapshot {
  const normalizedRequest = normalizeProjectTokenUsageRequest(request);
  const requestedProjectPaths = normalizeRequestedProjectPaths(normalizedRequest.projectPaths);
  const normalizedProjectPathAliases = Object.entries(normalizedRequest.projectPathAliases).reduce<
    Record<string, string[]>
  >((aliases, [projectPath, aliasPaths]) => {
    aliases[normalizeUsagePath(projectPath)] = normalizeRequestedProjectPaths(aliasPaths);
    return aliases;
  }, {});
  const usageRequest: NormalizedProjectTokenUsageRequest = {
    ...normalizedRequest,
    projectPathAliases: normalizedProjectPathAliases,
    projectPaths: requestedProjectPaths,
  };
  const statusesByProviderId = new Map(
    providerStatuses.map((status) => [status.providerId, status])
  );
  const projectMap = new Map<string, TokenUsageProjectSummary>();

  for (const projectPath of requestedProjectPaths) {
    projectMap.set(projectPath, {
      projectPath,
      sessionCount: 0,
      updatedAt: 0,
      totals: createEmptyTokenUsageCounts(),
      providers: [],
      ...(usageRequest.includeSessions ? { sessions: [] } : {}),
    });
  }

  for (const session of sessions.filter((item) => shouldIncludeSession(item, usageRequest))) {
    const projectPath = resolveProjectPath(session, usageRequest);
    const project = projectMap.get(projectPath) ?? {
      projectPath,
      sessionCount: 0,
      updatedAt: 0,
      totals: createEmptyTokenUsageCounts(),
      providers: [],
      ...(usageRequest.includeSessions ? { sessions: [] } : {}),
    };

    project.sessionCount += 1;
    project.updatedAt = Math.max(project.updatedAt, session.updatedAt);
    project.totals = addTokenUsageCounts(project.totals, session.counts);
    project.sessions?.push({
      ...session,
      projectPath,
    });

    const providerStatus = statusesByProviderId.get(session.providerId);
    const providerIndex = project.providers.findIndex(
      (provider) => provider.providerId === session.providerId
    );
    const currentProvider =
      providerIndex >= 0
        ? project.providers[providerIndex]
        : {
            providerId: session.providerId,
            agentFamily: session.agentFamily,
            label: providerStatus?.label ?? session.providerId,
            sessionCount: 0,
            totals: createEmptyTokenUsageCounts(),
          };

    const nextProvider = {
      ...currentProvider,
      sessionCount: currentProvider.sessionCount + 1,
      totals: addTokenUsageCounts(currentProvider.totals, session.counts),
    };

    if (providerIndex >= 0) {
      project.providers[providerIndex] = nextProvider;
    } else {
      project.providers.push(nextProvider);
    }

    projectMap.set(projectPath, project);
  }

  const projects = [...projectMap.values()].map((project) => ({
    ...project,
    providers: project.providers.sort(compareProviderSummaries),
    sessions: project.sessions?.sort(compareSessions),
  }));

  return {
    generatedAt,
    providerStatuses,
    projects: projects.sort(compareProjects),
  };
}
