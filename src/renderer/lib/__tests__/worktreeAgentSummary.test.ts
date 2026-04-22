import type { LiveAgentSubagent } from '@shared/types';
import { describe, expect, it } from 'vitest';
import {
  buildActiveSessionMapByWorktree,
  buildVisibleWorktreeSubagentRows,
  buildWorktreeSubagentTree,
  collectExpandableSubagentThreadIds,
  getSubagentStatusPresentation,
  groupSubagentsByWorktree,
} from '../worktreeAgentSummary';

const sessions = [
  {
    id: 'session-a',
    name: 'Codex',
    repoPath: '/repo',
    cwd: '/repo/worktrees/feature-a',
  },
  {
    id: 'session-b',
    name: 'Claude',
    repoPath: '/repo',
    cwd: '/repo/worktrees/feature-b',
  },
];

describe('worktreeAgentSummary', () => {
  it('picks the active session for each worktree and falls back to the first session', () => {
    const map = buildActiveSessionMapByWorktree(sessions, {
      '/repo/worktrees/feature-a': 'session-a',
      '/repo/worktrees/feature-b': 'missing-session',
    });

    expect(map.get('/repo/worktrees/feature-a')?.id).toBe('session-a');
    expect(map.get('/repo/worktrees/feature-b')?.id).toBe('session-b');
  });

  it('groups live subagents by worktree path', () => {
    const items: LiveAgentSubagent[] = [
      {
        id: 'child-1',
        provider: 'codex',
        threadId: 'child-1',
        parentThreadId: 'root-1',
        cwd: '/repo/worktrees/feature-a',
        label: 'Worker 1',
        agentType: 'worker',
        summary: 'Review the failing tests',
        lastSeenAt: 1,
        status: 'running',
      },
      {
        id: 'child-2',
        provider: 'codex',
        threadId: 'child-2',
        parentThreadId: 'root-2',
        cwd: '/repo/worktrees/feature-b',
        label: 'Worker 2',
        agentType: 'worker',
        summary: 'Inspect the editor flow',
        lastSeenAt: 2,
        status: 'waiting',
      },
    ];

    const map = groupSubagentsByWorktree(items);

    expect(map.get('/repo/worktrees/feature-a')).toEqual([items[0]]);
    expect(map.get('/repo/worktrees/feature-b')).toEqual([items[1]]);
  });

  it('builds a nested subagent tree from direct parent thread ids', () => {
    const items: LiveAgentSubagent[] = [
      {
        id: 'child-1',
        provider: 'codex',
        threadId: 'child-1',
        parentThreadId: 'root-1',
        cwd: '/repo/worktrees/feature-a',
        label: 'Worker 1',
        lastSeenAt: 2,
        status: 'running',
      },
      {
        id: 'child-2',
        provider: 'codex',
        threadId: 'child-2',
        parentThreadId: 'child-1',
        cwd: '/repo/worktrees/feature-a',
        label: 'Reviewer 1',
        lastSeenAt: 3,
        status: 'running',
      },
    ];

    expect(buildWorktreeSubagentTree(items)).toEqual([
      {
        item: items[0],
        children: [
          {
            item: items[1],
            children: [],
          },
        ],
      },
    ]);
  });

  it('collects expandable thread ids for nodes that have nested children', () => {
    const items: LiveAgentSubagent[] = [
      {
        id: 'child-1',
        provider: 'codex',
        threadId: 'child-1',
        parentThreadId: 'root-1',
        cwd: '/repo/worktrees/feature-a',
        label: 'Worker 1',
        lastSeenAt: 2,
        status: 'running',
      },
      {
        id: 'child-2',
        provider: 'codex',
        threadId: 'child-2',
        parentThreadId: 'child-1',
        cwd: '/repo/worktrees/feature-a',
        label: 'Reviewer 1',
        lastSeenAt: 3,
        status: 'running',
      },
    ];

    expect(collectExpandableSubagentThreadIds(buildWorktreeSubagentTree(items))).toEqual(
      new Set(['child-1'])
    );
  });

  it('hides descendant rows when a parent thread is collapsed', () => {
    const items: LiveAgentSubagent[] = [
      {
        id: 'child-1',
        provider: 'codex',
        threadId: 'child-1',
        parentThreadId: 'root-1',
        cwd: '/repo/worktrees/feature-a',
        label: 'Worker 1',
        lastSeenAt: 2,
        status: 'running',
      },
      {
        id: 'child-2',
        provider: 'codex',
        threadId: 'child-2',
        parentThreadId: 'child-1',
        cwd: '/repo/worktrees/feature-a',
        label: 'Reviewer 1',
        lastSeenAt: 3,
        status: 'running',
      },
    ];

    const tree = buildWorktreeSubagentTree(items);

    expect(buildVisibleWorktreeSubagentRows(tree, new Set())).toEqual([
      expect.objectContaining({
        threadId: 'child-1',
        depth: 1,
        hasChildren: true,
        isExpanded: true,
      }),
      expect.objectContaining({
        threadId: 'child-2',
        depth: 2,
        hasChildren: false,
        isExpanded: false,
      }),
    ]);

    expect(buildVisibleWorktreeSubagentRows(tree, new Set(['child-1']))).toEqual([
      expect.objectContaining({
        threadId: 'child-1',
        depth: 1,
        hasChildren: true,
        isExpanded: false,
      }),
    ]);
  });

  it('returns readable status presentation tokens for each subagent state', () => {
    expect(getSubagentStatusPresentation('running')).toMatchObject({
      label: 'Running',
      dotClassName: expect.stringContaining('bg-emerald'),
    });
    expect(getSubagentStatusPresentation('waiting')).toMatchObject({
      label: 'Waiting',
      dotClassName: expect.stringContaining('bg-amber'),
    });
    expect(getSubagentStatusPresentation('stale')).toMatchObject({
      label: 'Stale',
      dotClassName: expect.stringContaining('bg-muted-foreground/50'),
    });
    expect(getSubagentStatusPresentation('completed')).toMatchObject({
      label: 'Completed',
      dotClassName: expect.stringContaining('bg-sky'),
    });
  });
});
