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
