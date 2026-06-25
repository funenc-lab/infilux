import { toRemoteVirtualPath } from '@shared/utils/remotePath';
import { describe, expect, it } from 'vitest';
import { getWorkspaceNativeClaudeSkillSourcePaths } from '../sourcePaths';

describe('claude policy source paths', () => {
  it('detects source paths inside the active worktree native Claude skills directory', () => {
    expect(
      getWorkspaceNativeClaudeSkillSourcePaths(
        {
          sourcePath: '/repo/worktrees/feature-a/.claude/skills/planner/SKILL.md',
          sourcePaths: [
            '/repo/.agents/skills/planner/SKILL.md',
            '/repo/worktrees/feature-a/.claude/skills/planner/SKILL.md',
          ],
        },
        '/repo/worktrees/feature-a'
      )
    ).toEqual(['/repo/worktrees/feature-a/.claude/skills/planner/SKILL.md']);
  });

  it('detects source paths inside the active workspace agent skills directory', () => {
    expect(
      getWorkspaceNativeClaudeSkillSourcePaths(
        {
          sourcePath: '/repo/worktrees/feature-a/.agents/skills/planner/SKILL.md',
          sourcePaths: [
            '/repo/.agents/skills/planner/SKILL.md',
            '/repo/worktrees/feature-a/.agents/skills/planner/SKILL.md',
          ],
        },
        '/repo/worktrees/feature-a'
      )
    ).toEqual(['/repo/worktrees/feature-a/.agents/skills/planner/SKILL.md']);
  });

  it('normalizes Windows separators before matching native Claude skill paths', () => {
    expect(
      getWorkspaceNativeClaudeSkillSourcePaths(
        {
          sourcePath: 'C:\\repo\\feature-a\\.claude\\skills\\planner\\SKILL.md',
        },
        'C:\\repo\\feature-a'
      )
    ).toEqual(['C:\\repo\\feature-a\\.claude\\skills\\planner\\SKILL.md']);
  });

  it('ignores unsupported skill roots inside the active worktree', () => {
    expect(
      getWorkspaceNativeClaudeSkillSourcePaths(
        {
          sourcePath: '/repo/worktrees/feature-a/.gemini/skills/planner/SKILL.md',
        },
        '/repo/worktrees/feature-a'
      )
    ).toEqual([]);
  });

  it('ignores nested or non-SKILL files that the native disable action cannot quarantine', () => {
    expect(
      getWorkspaceNativeClaudeSkillSourcePaths(
        {
          sourcePaths: [
            '/repo/worktrees/feature-a/.claude/skills/team/planner/SKILL.md',
            '/repo/worktrees/feature-a/.claude/skills/planner/README.md',
          ],
        },
        '/repo/worktrees/feature-a'
      )
    ).toEqual([]);
  });

  it('detects remote virtual paths inside the active worktree native Claude skills directory', () => {
    const worktreePath = toRemoteVirtualPath('conn:1', '/srv/repo/worktrees/feature-a');
    const sourcePath = toRemoteVirtualPath(
      'conn:1',
      '/srv/repo/worktrees/feature-a/.claude/skills/planner/SKILL.md'
    );

    expect(
      getWorkspaceNativeClaudeSkillSourcePaths(
        {
          sourcePath,
        },
        worktreePath
      )
    ).toEqual([sourcePath]);
  });

  it('ignores remote virtual source paths from another connection', () => {
    const worktreePath = toRemoteVirtualPath('conn:1', '/srv/repo/worktrees/feature-a');
    const sourcePath = toRemoteVirtualPath(
      'conn:2',
      '/srv/repo/worktrees/feature-a/.claude/skills/planner/SKILL.md'
    );

    expect(
      getWorkspaceNativeClaudeSkillSourcePaths(
        {
          sourcePath,
        },
        worktreePath
      )
    ).toEqual([]);
  });

  it('detects remote catalog source paths when the worktree path is virtual', () => {
    const worktreePath = toRemoteVirtualPath('conn:1', '/srv/repo/worktrees/feature-a');
    const sourcePath = '/srv/repo/worktrees/feature-a/.claude/skills/planner/SKILL.md';

    expect(
      getWorkspaceNativeClaudeSkillSourcePaths(
        {
          sourcePath,
        },
        worktreePath
      )
    ).toEqual([sourcePath]);
  });
});
