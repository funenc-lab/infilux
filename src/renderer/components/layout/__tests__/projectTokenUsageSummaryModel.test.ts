import type { ProjectTokenUsageSnapshot } from '@shared/types';
import { describe, expect, it } from 'vitest';
import { buildProjectTokenUsageSummaryModel } from '../projectTokenUsageSummaryModel';

describe('projectTokenUsageSummaryModel', () => {
  it('builds compact project rows and unsupported provider status items', () => {
    const snapshot: ProjectTokenUsageSnapshot = {
      generatedAt: 1,
      freshness: {
        source: 'scan',
        cachedAt: 1,
        cacheTtlMs: 60_000,
        isStale: false,
        backgroundRefresh: false,
      },
      providerStatuses: [
        {
          providerId: 'codex-cli',
          agentFamily: 'codex',
          label: 'Codex CLI',
          status: 'available',
        },
        {
          providerId: 'gemini-cli',
          agentFamily: 'gemini',
          label: 'Gemini CLI',
          status: 'unsupported',
          reason: 'No stable token usage log was found for this provider.',
        },
      ],
      projects: [
        {
          projectPath: '/repo/app',
          sessionCount: 2,
          updatedAt: 2,
          totals: {
            inputTokens: 1200,
            outputTokens: 300,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 100,
            cachedInputTokens: 400,
            reasoningOutputTokens: 50,
            totalTokens: 1650,
          },
          providers: [
            {
              providerId: 'codex-cli',
              agentFamily: 'codex',
              label: 'Codex CLI',
              sessionCount: 2,
              totals: {
                inputTokens: 1200,
                outputTokens: 300,
                cacheCreationInputTokens: 0,
                cacheReadInputTokens: 100,
                cachedInputTokens: 400,
                reasoningOutputTokens: 50,
                totalTokens: 1650,
              },
            },
          ],
        },
      ],
    };

    expect(buildProjectTokenUsageSummaryModel(snapshot)).toMatchObject({
      hasUsage: true,
      hasProjects: true,
      totalTokensLabel: '1.7K',
      projectCountLabel: '1 project',
      sessionCountLabel: '2 sessions',
      providerIssueCountLabel: '1 provider issue',
      freshness: {
        statusLabel: 'Fresh scan',
        tone: 'fresh',
        generatedAt: 1,
      },
      primaryMetrics: [
        {
          key: 'input',
          label: 'Input tokens',
          value: '1.2K',
        },
        {
          key: 'output',
          label: 'Output tokens',
          value: '300',
        },
      ],
      secondaryMetrics: [
        {
          key: 'prompt-cache',
          label: 'Prompt cache tokens',
          value: '100',
        },
        {
          key: 'cached-input',
          label: 'Cached input tokens',
          value: '400',
        },
        {
          key: 'reasoning',
          label: 'Reasoning tokens',
          value: '50',
        },
      ],
      projects: [
        {
          key: '/repo/app',
          title: 'app',
          pathLabel: '/repo/app',
          totalTokensLabel: '1.7K',
          sharePercent: 100,
          sharePercentLabel: '100%',
          shareWidth: '100%',
          primaryTokenMetrics: [
            {
              key: 'input',
              label: 'Input tokens',
              value: '1.2K',
            },
            {
              key: 'output',
              label: 'Output tokens',
              value: '300',
            },
          ],
          secondaryTokenMetrics: [
            {
              key: 'prompt-cache',
              label: 'Prompt cache tokens',
              value: '100',
            },
            {
              key: 'cached-input',
              label: 'Cached input tokens',
              value: '400',
            },
            {
              key: 'reasoning',
              label: 'Reasoning tokens',
              value: '50',
            },
          ],
          providerLabel: 'Codex CLI',
          sessionLabel: '2 sessions',
        },
      ],
      providerStatuses: [
        {
          key: 'gemini-cli',
          label: 'Gemini CLI',
          statusLabel: 'Unsupported',
          tone: 'warning',
          reason: 'No stable token usage log was found for this provider.',
        },
      ],
      emptyState: null,
    });
  });

  it('returns an empty model when no snapshot has been loaded', () => {
    expect(buildProjectTokenUsageSummaryModel(null)).toEqual({
      hasUsage: false,
      hasProjects: false,
      totalTokensLabel: '0',
      projectCountLabel: '0 projects',
      sessionCountLabel: '0 sessions',
      providerIssueCountLabel: '0 provider issues',
      freshness: null,
      primaryMetrics: [
        {
          key: 'input',
          label: 'Input tokens',
          value: '0',
        },
        {
          key: 'output',
          label: 'Output tokens',
          value: '0',
        },
      ],
      secondaryMetrics: [
        {
          key: 'prompt-cache',
          label: 'Prompt cache tokens',
          value: '0',
        },
        {
          key: 'cached-input',
          label: 'Cached input tokens',
          value: '0',
        },
        {
          key: 'reasoning',
          label: 'Reasoning tokens',
          value: '0',
        },
      ],
      projects: [],
      providerStatuses: [],
      emptyState: {
        title: 'No token usage recorded',
        description: 'No token usage has been recorded for tracked providers.',
        detail: 'Open or refresh a supported agent session to populate this scope.',
      },
    });
  });

  it('keeps every project visible by default in the dedicated usage panel', () => {
    const projects = Array.from({ length: 5 }, (_, index) => ({
      projectPath: `/repo/project-${index + 1}`,
      sessionCount: 1,
      updatedAt: index + 1,
      totals: {
        inputTokens: 1,
        outputTokens: 0,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
        cachedInputTokens: 0,
        reasoningOutputTokens: 0,
        totalTokens: 1,
      },
      providers: [],
    }));

    expect(
      buildProjectTokenUsageSummaryModel({
        generatedAt: 1,
        providerStatuses: [],
        projects,
      }).projects
    ).toHaveLength(5);
  });
});
