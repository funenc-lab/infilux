import type {
  ProjectTokenUsageSnapshot,
  TokenUsageCounts,
  TokenUsageProjectSummary,
  TokenUsageProviderStatus,
} from '@shared/types';

export interface ProjectTokenUsageSummaryProjectModel {
  key: string;
  title: string;
  pathLabel: string;
  totalTokensLabel: string;
  sharePercent: number;
  sharePercentLabel: string;
  shareWidth: string;
  tokenMetrics: ProjectTokenUsageSummaryMetricModel[];
  providerLabel: string;
  sessionLabel: string;
}

export interface ProjectTokenUsageSummaryMetricModel {
  key: string;
  label: string;
  value: string;
}

export interface ProjectTokenUsageProviderStatusModel {
  key: string;
  label: string;
  statusLabel: string;
  tone: 'muted' | 'warning' | 'destructive';
  reason?: string;
}

export interface ProjectTokenUsageSummaryModel {
  hasUsage: boolean;
  totalTokensLabel: string;
  projectCountLabel: string;
  sessionCountLabel: string;
  providerIssueCountLabel: string;
  summaryMetrics: ProjectTokenUsageSummaryMetricModel[];
  projects: ProjectTokenUsageSummaryProjectModel[];
  providerStatuses: ProjectTokenUsageProviderStatusModel[];
}

function formatCompactNumber(value: number): string {
  if (value >= 1_000_000) {
    return `${(Math.round(value / 100_000) / 10).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(Math.round(value / 100) / 10).toFixed(1)}K`;
  }
  return String(value);
}

function formatCountLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getProjectTitle(projectPath: string): string {
  const parts = projectPath.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.at(-1) ?? projectPath;
}

function getCacheTokenCount(counts: TokenUsageCounts): number {
  return counts.cacheCreationInputTokens + counts.cacheReadInputTokens + counts.cachedInputTokens;
}

function getEmptyTokenUsageCounts(): TokenUsageCounts {
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

function addTokenUsageCounts(left: TokenUsageCounts, right: TokenUsageCounts): TokenUsageCounts {
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

function getProviderLabel(project: TokenUsageProjectSummary): string {
  if (project.providers.length === 0) {
    return 'No provider';
  }
  if (project.providers.length === 1) {
    return project.providers[0].label;
  }
  return `${project.providers[0].label} +${project.providers.length - 1}`;
}

function getSharePercent(projectTotal: number, snapshotTotal: number): number {
  if (snapshotTotal <= 0 || projectTotal <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(1, Math.round((projectTotal / snapshotTotal) * 100)));
}

function buildTokenBreakdownMetrics(
  counts: TokenUsageCounts
): ProjectTokenUsageSummaryMetricModel[] {
  return [
    {
      key: 'input',
      label: 'Input tokens',
      value: formatCompactNumber(counts.inputTokens),
    },
    {
      key: 'output',
      label: 'Output tokens',
      value: formatCompactNumber(counts.outputTokens),
    },
    {
      key: 'cache',
      label: 'Cache tokens',
      value: formatCompactNumber(getCacheTokenCount(counts)),
    },
    {
      key: 'reasoning',
      label: 'Reasoning tokens',
      value: formatCompactNumber(counts.reasoningOutputTokens),
    },
  ];
}

function toProjectModel(
  project: TokenUsageProjectSummary,
  snapshotTotalTokens: number
): ProjectTokenUsageSummaryProjectModel {
  const sharePercent = getSharePercent(project.totals.totalTokens, snapshotTotalTokens);

  return {
    key: project.projectPath,
    title: getProjectTitle(project.projectPath),
    pathLabel: project.projectPath,
    totalTokensLabel: formatCompactNumber(project.totals.totalTokens),
    sharePercent,
    sharePercentLabel: `${sharePercent}%`,
    shareWidth: `${sharePercent}%`,
    tokenMetrics: buildTokenBreakdownMetrics(project.totals),
    providerLabel: getProviderLabel(project),
    sessionLabel: formatCountLabel(project.sessionCount, 'session', 'sessions'),
  };
}

function getProviderStatusTone(
  status: TokenUsageProviderStatus
): ProjectTokenUsageProviderStatusModel['tone'] {
  if (status.status === 'error') {
    return 'destructive';
  }
  if (status.status === 'unsupported') {
    return 'warning';
  }
  return 'muted';
}

function toProviderStatusModel(
  status: TokenUsageProviderStatus
): ProjectTokenUsageProviderStatusModel | null {
  if (status.status === 'available') {
    return null;
  }

  return {
    key: status.providerId,
    label: status.label,
    statusLabel:
      status.status === 'unsupported'
        ? 'Unsupported'
        : status.status === 'not-found'
          ? 'No data'
          : 'Error',
    tone: getProviderStatusTone(status),
    ...(status.reason ? { reason: status.reason } : {}),
  };
}

export function buildProjectTokenUsageSummaryModel(
  snapshot: ProjectTokenUsageSnapshot | null,
  maxProjects = Number.POSITIVE_INFINITY
): ProjectTokenUsageSummaryModel {
  if (!snapshot) {
    const totalTokensLabel = '0';
    const projectCountLabel = '0 projects';
    const sessionCountLabel = '0 sessions';

    return {
      hasUsage: false,
      totalTokensLabel,
      projectCountLabel,
      sessionCountLabel,
      providerIssueCountLabel: '0 provider issues',
      summaryMetrics: buildTokenBreakdownMetrics(getEmptyTokenUsageCounts()),
      projects: [],
      providerStatuses: [],
    };
  }

  const totalCounts = snapshot.projects.reduce(
    (counts, project) => addTokenUsageCounts(counts, project.totals),
    getEmptyTokenUsageCounts()
  );
  const providerStatuses = snapshot.providerStatuses
    .map(toProviderStatusModel)
    .filter((item): item is ProjectTokenUsageProviderStatusModel => item !== null);
  const totalSessionCount = snapshot.projects.reduce(
    (sum, project) => sum + project.sessionCount,
    0
  );
  const totalTokensLabel = formatCompactNumber(totalCounts.totalTokens);
  const projectCountLabel = formatCountLabel(snapshot.projects.length, 'project', 'projects');
  const sessionCountLabel = formatCountLabel(totalSessionCount, 'session', 'sessions');

  return {
    hasUsage: snapshot.projects.length > 0,
    totalTokensLabel,
    projectCountLabel,
    sessionCountLabel,
    providerIssueCountLabel: formatCountLabel(
      providerStatuses.length,
      'provider issue',
      'provider issues'
    ),
    summaryMetrics: buildTokenBreakdownMetrics(totalCounts),
    projects: snapshot.projects
      .slice(0, maxProjects)
      .map((project) => toProjectModel(project, totalCounts.totalTokens)),
    providerStatuses,
  };
}
