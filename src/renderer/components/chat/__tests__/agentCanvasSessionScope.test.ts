import { describe, expect, it } from 'vitest';
import {
  buildAgentCanvasSessionGroupKey,
  resolveAgentCanvasSessionGroups,
} from '../agentCanvasSessionScope';

describe('agent canvas session scope', () => {
  const sessions = [
    {
      id: 'other-repo',
      repoPath: '/other',
      cwd: '/other/worktree',
      displayOrder: 0,
    },
    {
      id: 'current-2',
      repoPath: '/repo',
      cwd: '/repo/worktree-a',
      displayOrder: 1,
    },
    {
      id: 'second-1',
      repoPath: '/repo',
      cwd: '/repo/worktree-b',
      displayOrder: 0,
    },
    {
      id: 'current-1',
      repoPath: '/repo',
      cwd: '/repo/worktree-a/',
      displayOrder: 0,
    },
  ];

  it('keeps the existing worktree canvas scope limited to the current worktree', () => {
    expect(
      resolveAgentCanvasSessionGroups({
        currentWorktreePath: '/repo/worktree-a',
        repoPath: '/repo',
        scope: 'worktree',
        sessions,
      })
    ).toEqual([
      {
        groupKey: '/repo::/repo/worktree-a',
        isCurrentWorktree: true,
        repoPath: '/repo',
        sessions: [
          {
            id: 'current-1',
            repoPath: '/repo',
            cwd: '/repo/worktree-a/',
            displayOrder: 0,
          },
          {
            id: 'current-2',
            repoPath: '/repo',
            cwd: '/repo/worktree-a',
            displayOrder: 1,
          },
        ],
        worktreePath: '/repo/worktree-a',
      },
    ]);
  });

  it('keeps worktree canvas session order stable when smart ordering signals are present', () => {
    expect(
      resolveAgentCanvasSessionGroups({
        currentWorktreePath: '/repo/worktree-a',
        repoPath: '/repo',
        scope: 'worktree',
        sessions: [
          {
            id: 'display-first',
            repoPath: '/repo',
            cwd: '/repo/worktree-a',
            displayOrder: 0,
          },
          {
            id: 'attention-second',
            repoPath: '/repo',
            cwd: '/repo/worktree-a',
            displayOrder: 1,
          },
        ],
        sessionActivityStateById: {
          'attention-second': 'waiting_input',
          'display-first': 'idle',
        },
        sessionLastActivityAtById: {
          'attention-second': 20,
          'display-first': 10,
        },
      })[0]?.sessions.map((session) => session.id)
    ).toEqual(['display-first', 'attention-second']);
  });

  it('groups every session across the workspace for the global canvas scope', () => {
    expect(
      resolveAgentCanvasSessionGroups({
        currentWorktreePath: '/repo/worktree-a',
        repoPath: '/repo',
        scope: 'workspace',
        sessions,
      })
    ).toEqual([
      {
        groupKey: '/other::/other/worktree',
        isCurrentWorktree: false,
        repoPath: '/other',
        sessions: [
          {
            id: 'other-repo',
            repoPath: '/other',
            cwd: '/other/worktree',
            displayOrder: 0,
          },
        ],
        worktreePath: '/other/worktree',
      },
      {
        groupKey: '/repo::/repo/worktree-a',
        isCurrentWorktree: true,
        repoPath: '/repo',
        sessions: [
          {
            id: 'current-1',
            repoPath: '/repo',
            cwd: '/repo/worktree-a/',
            displayOrder: 0,
          },
          {
            id: 'current-2',
            repoPath: '/repo',
            cwd: '/repo/worktree-a',
            displayOrder: 1,
          },
        ],
        worktreePath: '/repo/worktree-a',
      },
      {
        groupKey: '/repo::/repo/worktree-b',
        isCurrentWorktree: false,
        repoPath: '/repo',
        sessions: [
          {
            id: 'second-1',
            repoPath: '/repo',
            cwd: '/repo/worktree-b',
            displayOrder: 0,
          },
        ],
        worktreePath: '/repo/worktree-b',
      },
    ]);
  });

  it('keeps global canvas groups in stable path order when the current worktree changes', () => {
    expect(
      resolveAgentCanvasSessionGroups({
        currentWorktreePath: '/repo/worktree-b',
        repoPath: '/repo',
        scope: 'workspace',
        sessions,
      }).map((group) => ({
        groupKey: group.groupKey,
        isCurrentWorktree: group.isCurrentWorktree,
        repoPath: group.repoPath,
        worktreePath: group.worktreePath,
      }))
    ).toEqual([
      {
        groupKey: '/other::/other/worktree',
        isCurrentWorktree: false,
        repoPath: '/other',
        worktreePath: '/other/worktree',
      },
      {
        groupKey: '/repo::/repo/worktree-a',
        isCurrentWorktree: false,
        repoPath: '/repo',
        worktreePath: '/repo/worktree-a',
      },
      {
        groupKey: '/repo::/repo/worktree-b',
        isCurrentWorktree: true,
        repoPath: '/repo',
        worktreePath: '/repo/worktree-b',
      },
    ]);
  });

  it('keeps workspace groups distinct when repositories share the same worktree path', () => {
    const sharedWorktreeSessions = [
      {
        id: 'repo-a-session',
        repoPath: '/repo-a',
        cwd: '/shared/worktree',
      },
      {
        id: 'repo-b-session',
        repoPath: '/repo-b',
        cwd: '/shared/worktree',
      },
    ];

    expect(
      resolveAgentCanvasSessionGroups({
        currentWorktreePath: '/shared/worktree',
        repoPath: '/repo-a',
        scope: 'workspace',
        sessions: sharedWorktreeSessions,
      }).map((group) => ({
        groupKey: group.groupKey,
        isCurrentWorktree: group.isCurrentWorktree,
        sessionIds: group.sessions.map((session) => session.id),
      }))
    ).toEqual([
      {
        groupKey: buildAgentCanvasSessionGroupKey('/repo-a', '/shared/worktree'),
        isCurrentWorktree: true,
        sessionIds: ['repo-a-session'],
      },
      {
        groupKey: buildAgentCanvasSessionGroupKey('/repo-b', '/shared/worktree'),
        isCurrentWorktree: false,
        sessionIds: ['repo-b-session'],
      },
    ]);
  });

  it('includes workspace worktrees that do not have agent sessions yet', () => {
    expect(
      resolveAgentCanvasSessionGroups({
        currentWorktreePath: '/repo/worktree-a',
        repoPath: '/repo',
        scope: 'workspace',
        sessions: [
          {
            id: 'current-session',
            repoPath: '/repo',
            cwd: '/repo/worktree-a',
          },
        ],
        worktrees: [
          {
            repoPath: '/repo',
            worktreePath: '/repo/worktree-a',
          },
          {
            repoPath: '/other',
            worktreePath: '/other/worktree',
          },
        ],
      }).map((group) => ({
        groupKey: group.groupKey,
        isCurrentWorktree: group.isCurrentWorktree,
        repoPath: group.repoPath,
        sessionIds: group.sessions.map((session) => session.id),
        worktreePath: group.worktreePath,
      }))
    ).toEqual([
      {
        groupKey: '/other::/other/worktree',
        isCurrentWorktree: false,
        repoPath: '/other',
        sessionIds: [],
        worktreePath: '/other/worktree',
      },
      {
        groupKey: '/repo::/repo/worktree-a',
        isCurrentWorktree: true,
        repoPath: '/repo',
        sessionIds: ['current-session'],
        worktreePath: '/repo/worktree-a',
      },
    ]);
  });

  it('orders workspace groups by the highest session activity before stable path order', () => {
    expect(
      resolveAgentCanvasSessionGroups({
        currentWorktreePath: '/repo/worktree-a',
        repoPath: '/repo',
        scope: 'workspace',
        sessions: [
          {
            id: 'idle-a',
            repoPath: '/repo',
            cwd: '/repo/worktree-a',
          },
          {
            id: 'running-z',
            repoPath: '/repo',
            cwd: '/repo/worktree-z',
          },
          {
            id: 'running-y',
            repoPath: '/repo',
            cwd: '/repo/worktree-y',
          },
          {
            id: 'waiting-b',
            repoPath: '/repo',
            cwd: '/repo/worktree-b',
          },
          {
            id: 'completed-c',
            repoPath: '/repo',
            cwd: '/repo/worktree-c',
          },
        ],
        sessionActivityStateById: {
          'completed-c': 'completed',
          'running-y': 'running',
          'running-z': 'running',
          'waiting-b': 'waiting_input',
        },
      }).map((group) => group.worktreePath)
    ).toEqual([
      '/repo/worktree-b',
      '/repo/worktree-y',
      '/repo/worktree-z',
      '/repo/worktree-c',
      '/repo/worktree-a',
    ]);
  });

  it('keeps idle workspace groups stable by path when the current worktree changes', () => {
    expect(
      resolveAgentCanvasSessionGroups({
        currentWorktreePath: '/repo/worktree-b',
        repoPath: '/repo',
        scope: 'workspace',
        sessions: [
          {
            id: 'idle-a',
            repoPath: '/repo',
            cwd: '/repo/worktree-a',
          },
          {
            id: 'idle-b',
            repoPath: '/repo',
            cwd: '/repo/worktree-b',
          },
        ],
        sessionActivityStateById: {
          'idle-a': 'idle',
          'idle-b': 'idle',
        },
      }).map((group) => group.worktreePath)
    ).toEqual(['/repo/worktree-a', '/repo/worktree-b']);
  });

  it('uses recent activity as the workspace group tiebreaker after activity', () => {
    expect(
      resolveAgentCanvasSessionGroups({
        currentWorktreePath: '/repo/worktree-a',
        repoPath: '/repo',
        scope: 'workspace',
        sessions: [
          {
            id: 'idle-a',
            repoPath: '/repo',
            cwd: '/repo/worktree-a',
          },
          {
            id: 'idle-b',
            repoPath: '/repo',
            cwd: '/repo/worktree-b',
          },
          {
            id: 'idle-c',
            repoPath: '/repo',
            cwd: '/repo/worktree-c',
          },
        ],
        sessionActivityStateById: {
          'idle-a': 'idle',
          'idle-b': 'idle',
          'idle-c': 'idle',
        },
        sessionLastActivityAtById: {
          'idle-a': 10,
          'idle-b': 20,
          'idle-c': 30,
        },
      }).map((group) => group.worktreePath)
    ).toEqual(['/repo/worktree-c', '/repo/worktree-b', '/repo/worktree-a']);
  });

  it('orders sessions inside workspace groups by activity before display order', () => {
    expect(
      resolveAgentCanvasSessionGroups({
        currentWorktreePath: '/repo/worktree-a',
        repoPath: '/repo',
        scope: 'workspace',
        sessions: [
          {
            id: 'idle-first',
            repoPath: '/repo',
            cwd: '/repo/worktree-a',
            displayOrder: 0,
          },
          {
            id: 'running-second',
            repoPath: '/repo',
            cwd: '/repo/worktree-a',
            displayOrder: 1,
          },
          {
            id: 'waiting-third',
            repoPath: '/repo',
            cwd: '/repo/worktree-a',
            displayOrder: 2,
          },
          {
            id: 'completed-fourth',
            repoPath: '/repo',
            cwd: '/repo/worktree-a',
            displayOrder: 3,
          },
        ],
        sessionActivityStateById: {
          'completed-fourth': 'completed',
          'running-second': 'running',
          'waiting-third': 'waiting_input',
        },
      })[0]?.sessions.map((session) => session.id)
    ).toEqual(['waiting-third', 'running-second', 'completed-fourth', 'idle-first']);
  });

  it('orders sessions inside workspace groups by recent activity before display order', () => {
    expect(
      resolveAgentCanvasSessionGroups({
        currentWorktreePath: '/repo/worktree-a',
        repoPath: '/repo',
        scope: 'workspace',
        sessions: [
          {
            id: 'older-display-first',
            repoPath: '/repo',
            cwd: '/repo/worktree-a',
            displayOrder: 0,
          },
          {
            id: 'newer-display-second',
            repoPath: '/repo',
            cwd: '/repo/worktree-a',
            displayOrder: 1,
          },
        ],
        sessionActivityStateById: {
          'newer-display-second': 'idle',
          'older-display-first': 'idle',
        },
        sessionLastActivityAtById: {
          'newer-display-second': 20,
          'older-display-first': 10,
        },
      })[0]?.sessions.map((session) => session.id)
    ).toEqual(['newer-display-second', 'older-display-first']);
  });
});
