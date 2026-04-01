import { describe, expect, it } from 'vitest';
import { collectMountedAgentSessionIds } from '../agentPanelMountPolicy';

describe('collectMountedAgentSessionIds', () => {
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
});
