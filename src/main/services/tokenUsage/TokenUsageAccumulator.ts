import type {
  GetProjectTokenUsageRequest,
  ProjectTokenUsageSnapshot,
  TokenUsageCounts,
  TokenUsageProjectSummary,
  TokenUsageProviderStatus,
  TokenUsageProviderSummary,
  TokenUsageSessionSummary,
} from '@shared/types/tokenUsage';

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
      counts.cacheReadInputTokens +
      counts.reasoningOutputTokens;
  }

  return counts;
}

function normalizeUsagePath(value: string): string {
  const normalized = value.replace(/\\/g, '/').replace(/\/+$/g, '');
  return normalized || '/';
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

function isSameOrChildPath(candidatePath: string, projectPath: string): boolean {
  const candidate = normalizeUsagePath(candidatePath);
  const project = normalizeUsagePath(projectPath);
  return candidate === project || candidate.startsWith(`${project}/`);
}

function resolveProjectPath(
  session: TokenUsageSessionSummary,
  projectPaths: string[] | undefined
): string {
  if (!projectPaths?.length) {
    return normalizeUsagePath(session.projectPath || session.cwd);
  }

  const matchedProject = projectPaths.find(
    (projectPath) =>
      isSameOrChildPath(session.projectPath, projectPath) ||
      isSameOrChildPath(session.cwd, projectPath)
  );
  return normalizeUsagePath(matchedProject ?? session.projectPath);
}

function shouldIncludeSession(
  session: TokenUsageSessionSummary,
  projectPaths: string[] | undefined
): boolean {
  if (!projectPaths?.length) {
    return true;
  }

  return projectPaths.some(
    (projectPath) =>
      isSameOrChildPath(session.projectPath, projectPath) ||
      isSameOrChildPath(session.cwd, projectPath)
  );
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
  const requestedProjectPaths = normalizeRequestedProjectPaths(request.projectPaths);
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
      ...(request.includeSessions ? { sessions: [] } : {}),
    });
  }

  for (const session of sessions.filter((item) =>
    shouldIncludeSession(item, requestedProjectPaths)
  )) {
    const projectPath = resolveProjectPath(session, requestedProjectPaths);
    const project = projectMap.get(projectPath) ?? {
      projectPath,
      sessionCount: 0,
      updatedAt: 0,
      totals: createEmptyTokenUsageCounts(),
      providers: [],
      ...(request.includeSessions ? { sessions: [] } : {}),
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
