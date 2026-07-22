import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('lucide-react', () => {
  const icon = (props: Record<string, unknown>) => React.createElement('svg', props);
  return {
    CornerDownRight: icon,
    Sparkles: icon,
  };
});

vi.mock('@/lib/utils', () => ({
  cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
}));

import { WorktreeAgentSummary } from '../WorktreeAgentSummary';

describe('WorktreeAgentSummary', () => {
  it('exposes the complete agent session name when the visible label is truncated', () => {
    const markup = renderToStaticMarkup(
      React.createElement(WorktreeAgentSummary, {
        session: {
          id: 'session-1',
          name: 'Investigate provider transcript identity reliability',
          agentId: 'codex',
          agentCommand: 'codex',
          initialized: true,
          repoPath: '/repo/main',
          cwd: '/repo/main/worktrees/current',
        },
      })
    );

    expect(markup).toContain('title="Investigate provider transcript identity reliability"');
  });
});
