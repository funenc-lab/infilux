import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collectMountedAgentSessionIds,
  resolveMountedAgentPanelSessionIds,
} from '../agentPanelMountPolicy';

describe('collectMountedAgentSessionIds', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('only keeps sessions from the current worktree', () => {
    expect(
      collectMountedAgentSessionIds(
        [
          { id: 'session-a', repoPath: '/repo-a', cwd: '/repo-a/worktree-1' },
          { id: 'session-b', repoPath: '/repo-a', cwd: '/repo-a/worktree-2' },
          { id: 'session-c', repoPath: '/repo-b', cwd: '/repo-b/worktree-1' },
        ],
        '/repo-a',
        '/repo-a/worktree-1'
      )
    ).toEqual(['session-a']);
  });

  it('treats equivalent worktree paths as the same session owner', () => {
    expect(
      collectMountedAgentSessionIds(
        [{ id: 'session-a', repoPath: '/repo-a', cwd: '/Users/tanzv/Repo/Worktree/' }],
        '/repo-a',
        '/users/tanzv/repo/worktree'
      )
    ).toEqual(['session-a']);
  });

  it('treats equivalent repository paths as the same mounted session scope', () => {
    expect(
      collectMountedAgentSessionIds(
        [
          {
            id: 'session-a',
            repoPath: '/Users/tanzv/Development/Git/Lads-Gateway/',
            cwd: '/Users/tanzv/Development/Git/Lads-Gateway/worktrees/feat-skill-mcp/',
          },
        ],
        '/users/tanzv/development/git/lads-gateway',
        '/users/tanzv/development/git/lads-gateway/worktrees/feat-skill-mcp'
      )
    ).toEqual(['session-a']);
  });
});

describe('resolveMountedAgentPanelSessionIds', () => {
  it('suppresses retained non-host panels while the workspace canvas host owns all sessions', () => {
    expect(
      resolveMountedAgentPanelSessionIds({
        canvasSessions: [{ id: 'worktree-a' }, { id: 'worktree-b' }],
        currentWorktreeSessions: [{ id: 'worktree-b' }],
        globalSessionIds: ['worktree-b'],
        isWorkspaceCanvasDisplayMode: false,
        suppressSessionMounting: true,
      })
    ).toEqual([]);
  });

  it('keeps every workspace canvas session mounted independently from active panel state', () => {
    expect(
      resolveMountedAgentPanelSessionIds({
        canvasSessions: [{ id: 'worktree-a' }, { id: 'worktree-b' }],
        currentWorktreeSessions: [{ id: 'worktree-a' }],
        globalSessionIds: [],
        isWorkspaceCanvasDisplayMode: true,
      })
    ).toEqual(['worktree-a', 'worktree-b']);
  });

  it('limits idle workspace canvas terminal mounts while preserving focused and attention sessions', () => {
    const workspaceCanvasTerminalMountLimit = 5;
    const canvasSessions = Array.from({ length: 15 }, (_, index) => ({
      id: `session-${index}`,
    }));

    expect(
      resolveMountedAgentPanelSessionIds({
        canvasSessions,
        currentWorktreeSessions: [],
        globalSessionIds: [],
        isWorkspaceCanvasDisplayMode: true,
        canvasFocusedSessionId: 'session-14',
        sessionActivityStateById: {
          'session-10': 'running',
          'session-12': 'waiting_input',
          'session-13': 'completed',
        },
        workspaceCanvasTerminalMountLimit,
      })
    ).toEqual(['session-0', 'session-10', 'session-12', 'session-13', 'session-14']);
  });

  it('keeps idle workspace canvas mount slots stable when visual group order changes', () => {
    const canvasSessions = Array.from({ length: 14 }, (_, index) => ({
      id: `session-${index}`,
      repoPath: '/repo',
      cwd: `/repo/worktree-${index}`,
      createdAt: index,
    }));
    const currentWorktreeFirstSessions = [
      canvasSessions[9],
      ...canvasSessions.filter((session) => session.id !== 'session-9'),
    ];
    const expectedMountedSessionIds = [
      'session-0',
      'session-1',
      'session-10',
      'session-11',
      'session-12',
      'session-13',
      'session-2',
      'session-3',
      'session-4',
      'session-5',
      'session-6',
      'session-7',
    ];

    expect(
      new Set(
        resolveMountedAgentPanelSessionIds({
          canvasSessions: currentWorktreeFirstSessions,
          currentWorktreeSessions: [],
          globalSessionIds: [],
          isWorkspaceCanvasDisplayMode: true,
          workspaceCanvasTerminalMountLimit: 12,
        })
      )
    ).toEqual(new Set(expectedMountedSessionIds));
  });

  it('keeps workspace canvas attention mounts within the terminal budget by priority', () => {
    const canvasSessions = Array.from({ length: 8 }, (_, index) => ({
      id: `session-${index}`,
    }));

    expect(
      resolveMountedAgentPanelSessionIds({
        canvasSessions,
        currentWorktreeSessions: [],
        globalSessionIds: [],
        isWorkspaceCanvasDisplayMode: true,
        sessionActivityStateById: {
          'session-0': 'completed',
          'session-1': 'completed',
          'session-2': 'running',
          'session-3': 'waiting_input',
          'session-4': 'completed',
          'session-5': 'running',
          'session-6': 'waiting_input',
          'session-7': 'running',
        },
        workspaceCanvasTerminalMountLimit: 4,
      })
    ).toEqual(['session-2', 'session-3', 'session-5', 'session-6']);
  });

  it('reserves workspace canvas terminal budget for focused sessions before attention sessions', () => {
    const canvasSessions = Array.from({ length: 5 }, (_, index) => ({
      id: `session-${index}`,
    }));

    expect(
      resolveMountedAgentPanelSessionIds({
        canvasSessions,
        currentWorktreeSessions: [],
        globalSessionIds: [],
        isWorkspaceCanvasDisplayMode: true,
        canvasFocusedSessionId: 'session-4',
        sessionActivityStateById: {
          'session-0': 'waiting_input',
          'session-1': 'waiting_input',
          'session-2': 'running',
          'session-3': 'running',
        },
        workspaceCanvasTerminalMountLimit: 3,
      })
    ).toEqual(['session-0', 'session-1', 'session-4']);
  });

  it('preserves existing current-worktree mount ordering with cached hidden sessions', () => {
    expect(
      resolveMountedAgentPanelSessionIds({
        canvasSessions: [{ id: 'worktree-a' }],
        currentWorktreeSessions: [{ id: 'worktree-a' }, { id: 'worktree-a-second' }],
        globalSessionIds: ['worktree-a-second', 'hidden-session'],
        isWorkspaceCanvasDisplayMode: false,
      })
    ).toEqual(['worktree-a', 'worktree-a-second', 'hidden-session']);
  });
});
