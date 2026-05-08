import type { ProjectTokenUsageSnapshot } from '@shared/types';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ProjectTokenUsageSummary } from '../ProjectTokenUsageSummary';

vi.mock('lucide-react', () => ({
  AlertTriangle: (props: Record<string, unknown>) => React.createElement('svg', props),
  CircleAlert: (props: Record<string, unknown>) => React.createElement('svg', props),
  FolderGit2: (props: Record<string, unknown>) => React.createElement('svg', props),
  Radar: (props: Record<string, unknown>) => React.createElement('svg', props),
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string) => value,
  }),
}));

describe('ProjectTokenUsageSummary render', () => {
  it('does not render the summary panel during initial loading', () => {
    const markup = renderToStaticMarkup(
      React.createElement(ProjectTokenUsageSummary, {
        snapshot: null,
        loading: true,
        errorMessage: null,
      })
    );

    expect(markup).toBe('');
    expect(markup).not.toContain('Input tokens');
    expect(markup).not.toContain('0 projects');
    expect(markup).not.toContain('Refresh token usage');
  });

  it('renders summary metrics, project share, and provider coverage as separate sections', () => {
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
            inputTokens: 900,
            outputTokens: 100,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 0,
            cachedInputTokens: 0,
            reasoningOutputTokens: 0,
            totalTokens: 1000,
          },
          providers: [],
        },
      ],
    };

    const markup = renderToStaticMarkup(
      React.createElement(ProjectTokenUsageSummary, {
        snapshot,
        loading: false,
        errorMessage: null,
      })
    );

    expect(markup).toContain('Project Totals');
    expect(markup).toContain('Fresh scan');
    expect(markup).toContain('Updated');
    expect(markup).toContain('Token Mix');
    expect(markup).toContain('Tracked Projects');
    expect(markup).toContain('Provider Coverage');
    expect(markup).toContain('Total tokens');
    expect(markup).toContain('Input tokens');
    expect(markup).toContain('Output tokens');
    expect(markup).toContain('Cache tokens');
    expect(markup).toContain('Prompt cache tokens');
    expect(markup).toContain('Cached input tokens');
    expect(markup).toContain('Reasoning tokens');
    expect(markup).toContain('1.0K');
    expect(markup).toContain('100%');
    expect(markup).toContain('900');
    expect(markup).toContain('100');
    expect(markup).toContain('Gemini CLI');
    expect(markup).toContain('Unsupported');
    expect(markup).toContain('No stable token usage log was found for this provider.');
    expect(markup).not.toContain('Refresh token usage');
  });

  it('renders diagnostic empty state copy when no usage is recorded', () => {
    const snapshot: ProjectTokenUsageSnapshot = {
      generatedAt: 1,
      freshness: {
        source: 'cache',
        cachedAt: 1,
        cacheTtlMs: 60_000,
        isStale: true,
        backgroundRefresh: true,
      },
      providerStatuses: [
        {
          providerId: 'codex-cli',
          agentFamily: 'codex',
          label: 'Codex CLI',
          status: 'not-found',
          reason: 'Codex usage log directory was not found.',
        },
      ],
      projects: [],
    };

    const markup = renderToStaticMarkup(
      React.createElement(ProjectTokenUsageSummary, {
        snapshot,
        loading: false,
        errorMessage: null,
      })
    );

    expect(markup).toContain('Refreshing cached data');
    expect(markup).toContain('No token usage recorded');
    expect(markup).toContain('No token usage has been recorded for tracked providers.');
    expect(markup).toContain('Open or refresh a supported agent session to populate this scope.');
    expect(markup).toContain('Codex CLI');
    expect(markup).toContain('No data');
    expect(markup).toContain('Codex usage log directory was not found.');
  });
});
