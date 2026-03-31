import type { LiveAgentSubagent } from '@shared/types';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('lucide-react', () => {
  const icon = (props: Record<string, unknown>) => React.createElement('svg', props);
  return {
    ChevronRight: icon,
    CornerDownRight: icon,
    Sparkles: icon,
  };
});

vi.mock('@/lib/utils', () => ({
  cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
}));

vi.mock('@/lib/worktreeAgentSummary', async () => {
  const actual = await vi.importActual<typeof import('@/lib/worktreeAgentSummary')>(
    '@/lib/worktreeAgentSummary'
  );

  return {
    ...actual,
    getSubagentStatusPresentation: () => ({
      label: 'Running',
      dotClassName: 'dot-running',
      badgeClassName: 'badge-running',
      buttonClassName: 'button-running',
    }),
  };
});

import { WorktreeAgentChildren } from '../WorktreeAgentChildren';

describe('WorktreeAgentChildren', () => {
  it('renders distinct agent and subagent child rows for a worktree', () => {
    const session = {
      id: 'session-1',
      name: 'Codex Main',
      agentId: 'codex:main',
      agentCommand: 'codex',
      initialized: true,
      repoPath: '/repo/main',
      cwd: '/repo/main/worktrees/current',
    } as const;

    const subagent: LiveAgentSubagent = {
      id: 'child-1',
      provider: 'codex',
      threadId: 'child-thread-1',
      parentThreadId: 'root-thread-1',
      cwd: '/repo/main/worktrees/current',
      label: 'Reviewer 1',
      lastSeenAt: Date.now(),
      status: 'running',
    };

    const markup = renderToStaticMarkup(
      React.createElement(WorktreeAgentChildren, {
        session,
        subagents: [subagent],
      })
    );

    expect(markup).toContain('data-worktree-child-kind="agent"');
    expect(markup).toContain('data-worktree-child-kind="subagent"');
    expect(markup).toContain('Codex Main');
    expect(markup).toContain('Reviewer 1');
  });

  it('renders nested subagents using parent thread relationships', () => {
    const session = {
      id: 'session-1',
      name: 'Codex Main',
      agentId: 'codex:main',
      agentCommand: 'codex',
      initialized: true,
      repoPath: '/repo/main',
      cwd: '/repo/main/worktrees/current',
    } as const;

    const parentSubagent: LiveAgentSubagent = {
      id: 'child-1',
      provider: 'codex',
      threadId: 'child-thread-1',
      parentThreadId: 'root-thread-1',
      cwd: '/repo/main/worktrees/current',
      label: 'Worker 1',
      lastSeenAt: 10,
      status: 'running',
    };

    const nestedSubagent: LiveAgentSubagent = {
      id: 'child-2',
      provider: 'codex',
      threadId: 'child-thread-2',
      parentThreadId: 'child-thread-1',
      cwd: '/repo/main/worktrees/current',
      label: 'Reviewer 1',
      lastSeenAt: 11,
      status: 'running',
    };

    const markup = renderToStaticMarkup(
      React.createElement(WorktreeAgentChildren, {
        session,
        subagents: [parentSubagent, nestedSubagent],
      })
    );

    expect(markup).toContain('data-worktree-child-depth="1"');
    expect(markup).toContain('data-worktree-child-depth="2"');
    expect(markup).toContain('Worker 1');
    expect(markup).toContain('Reviewer 1');
  });

  it('marks the currently viewed subagent row as selected', () => {
    const session = {
      id: 'session-1',
      name: 'Codex Main',
      agentId: 'codex:main',
      agentCommand: 'codex',
      initialized: true,
      repoPath: '/repo/main',
      cwd: '/repo/main/worktrees/current',
    } as const;

    const subagent: LiveAgentSubagent = {
      id: 'child-1',
      provider: 'codex',
      threadId: 'child-thread-1',
      parentThreadId: 'root-thread-1',
      cwd: '/repo/main/worktrees/current',
      label: 'Reviewer 1',
      lastSeenAt: Date.now(),
      status: 'running',
    };

    const markup = renderToStaticMarkup(
      React.createElement(WorktreeAgentChildren, {
        session,
        subagents: [subagent],
        selectedSubagentThreadId: 'child-thread-1',
      })
    );

    expect(markup).toContain('data-selected="true"');
    expect(markup).toContain('Reviewer 1');
  });

  it('marks the current agent row as selected when the chat context is on the parent session', () => {
    const session = {
      id: 'session-1',
      name: 'Codex Main',
      agentId: 'codex:main',
      agentCommand: 'codex',
      initialized: true,
      repoPath: '/repo/main',
      cwd: '/repo/main/worktrees/current',
    } as const;

    const markup = renderToStaticMarkup(
      React.createElement(WorktreeAgentChildren, {
        session,
        subagents: [],
        selectedAgentSessionId: 'session-1',
      })
    );

    expect(markup).toContain('data-worktree-child-kind="agent"');
    expect(markup).toContain('data-selected="true"');
    expect(markup).toContain('Codex Main');
  });
});
