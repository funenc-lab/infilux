import type { ProjectTokenUsageSnapshot } from '@shared/types';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ProjectTokenUsageSummary } from '../ProjectTokenUsageSummary';

vi.mock('lucide-react', () => ({
  AlertTriangle: (props: Record<string, unknown>) => React.createElement('svg', props),
  FolderGit2: (props: Record<string, unknown>) => React.createElement('svg', props),
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
      providerStatuses: [
        {
          providerId: 'gemini-cli',
          agentFamily: 'gemini',
          label: 'Gemini CLI',
          status: 'unsupported',
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
    expect(markup).toContain('Tracked Projects');
    expect(markup).toContain('Provider Coverage');
    expect(markup).toContain('Input tokens');
    expect(markup).toContain('Output tokens');
    expect(markup).toContain('Cache tokens');
    expect(markup).toContain('Reasoning tokens');
    expect(markup).toContain('1.0K');
    expect(markup).toContain('100%');
    expect(markup).toContain('900');
    expect(markup).toContain('100');
    expect(markup).toContain('Gemini CLI: Unsupported');
    expect(markup).not.toContain('Refresh token usage');
  });
});
