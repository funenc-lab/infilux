import { describe, expect, it } from 'vitest';
import {
  normalizeAgentSessionLaunchTarget,
  resolveAgentSessionLaunchTarget,
} from '../agentSessionLaunchTarget';

describe('normalizeAgentSessionLaunchTarget', () => {
  it('keeps legacy group id targets compatible', () => {
    expect(normalizeAgentSessionLaunchTarget('group-1')).toEqual({ groupId: 'group-1' });
  });

  it('returns an empty target when no explicit target is provided', () => {
    expect(normalizeAgentSessionLaunchTarget()).toEqual({});
  });
});

describe('resolveAgentSessionLaunchTarget', () => {
  it('uses the current repo and worktree when no workspace target is provided', () => {
    expect(
      resolveAgentSessionLaunchTarget({
        currentRepoPath: '/repo/current',
        currentWorktreePath: '/repo/current/main',
      })
    ).toEqual({
      repoPath: '/repo/current',
      worktreePath: '/repo/current/main',
    });
  });

  it('routes workspace canvas launches to the selected worktree group', () => {
    expect(
      resolveAgentSessionLaunchTarget({
        currentRepoPath: '/repo/current',
        currentWorktreePath: '/repo/current/main',
        target: {
          repoPath: '/repo/current',
          worktreePath: '/repo/current/feature-a',
        },
      })
    ).toEqual({
      repoPath: '/repo/current',
      worktreePath: '/repo/current/feature-a',
    });
  });

  it('lets explicit session overrides win over the UI launch target', () => {
    expect(
      resolveAgentSessionLaunchTarget({
        currentRepoPath: '/repo/current',
        currentWorktreePath: '/repo/current/main',
        sessionOverrides: {
          cwd: '/repo/current/handoff',
          repoPath: '/repo/current',
        },
        target: {
          groupId: 'group-1',
          repoPath: '/repo/other',
          worktreePath: '/repo/other/feature-b',
        },
      })
    ).toEqual({
      groupId: 'group-1',
      repoPath: '/repo/current',
      worktreePath: '/repo/current/handoff',
    });
  });
});
