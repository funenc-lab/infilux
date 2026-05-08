import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { toRemoteVirtualPath } from '@shared/utils/remotePath';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  disableWorkspaceNativeClaudeSkill,
  restoreWorkspaceNativeClaudeSkill,
} from '../ClaudeNativeSkillService';

const remoteRepositoryBackend = vi.hoisted(() => ({
  exists: vi.fn(),
  rename: vi.fn(),
}));

vi.mock('../../remote/RemoteRepositoryBackend', () => ({
  remoteRepositoryBackend,
}));

describe('ClaudeNativeSkillService', () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'infilux-native-skill-'));
    remoteRepositoryBackend.exists.mockReset();
    remoteRepositoryBackend.rename.mockReset();
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('renames a worktree-native Claude skill directory to a disabled backup path', async () => {
    const worktreePath = join(rootDir, 'repo', 'worktrees', 'feature-a');
    const skillDir = join(worktreePath, '.claude', 'skills', 'planner');
    const skillFile = join(skillDir, 'SKILL.md');
    await mkdir(skillDir, { recursive: true });
    writeFileSync(skillFile, '---\nname: planner\n---\n', 'utf8');

    const result = await disableWorkspaceNativeClaudeSkill({
      worktreePath,
      sourcePath: skillFile,
    });

    expect(result.ok).toBe(true);
    expect(existsSync(skillDir)).toBe(false);
    expect(existsSync(result.disabledPath)).toBe(true);
    expect(readFileSync(join(result.disabledPath, 'SKILL.md'), 'utf8')).toContain('name: planner');
  });

  it('rejects source paths outside the active worktree native Claude skills directory', async () => {
    const worktreePath = join(rootDir, 'repo', 'worktrees', 'feature-a');
    const sourcePath = join(rootDir, 'repo', '.claude', 'skills', 'planner', 'SKILL.md');

    await expect(
      disableWorkspaceNativeClaudeSkill({
        worktreePath,
        sourcePath,
      })
    ).rejects.toThrow(
      'Source path must be a SKILL.md file inside the worktree .claude/skills directory'
    );
  });

  it('does not overwrite an existing disabled backup directory', async () => {
    const worktreePath = join(rootDir, 'repo', 'worktrees', 'feature-a');
    const skillDir = join(worktreePath, '.claude', 'skills', 'planner');
    const disabledDir = join(worktreePath, '.claude', 'skills.disabled', 'planner');
    await mkdir(skillDir, { recursive: true });
    await mkdir(disabledDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), '---\nname: planner\n---\n', 'utf8');

    await expect(
      disableWorkspaceNativeClaudeSkill({
        worktreePath,
        sourcePath: join(skillDir, 'SKILL.md'),
      })
    ).rejects.toThrow('Disabled skill destination already exists');
  });

  it('renames remote worktree-native Claude skill directories through the remote backend', async () => {
    const worktreePath = toRemoteVirtualPath('conn:1', '/srv/repo/worktrees/feature-a');
    const sourcePath = toRemoteVirtualPath(
      'conn:1',
      '/srv/repo/worktrees/feature-a/.claude/skills/planner/SKILL.md'
    );
    remoteRepositoryBackend.exists.mockResolvedValue(false);

    const result = await disableWorkspaceNativeClaudeSkill({
      worktreePath,
      sourcePath,
    });

    expect(remoteRepositoryBackend.exists).toHaveBeenCalledWith(
      toRemoteVirtualPath('conn:1', '/srv/repo/worktrees/feature-a/.claude/skills.disabled/planner')
    );
    expect(remoteRepositoryBackend.rename).toHaveBeenCalledWith(
      toRemoteVirtualPath('conn:1', '/srv/repo/worktrees/feature-a/.claude/skills/planner'),
      toRemoteVirtualPath('conn:1', '/srv/repo/worktrees/feature-a/.claude/skills.disabled/planner')
    );
    expect(result.disabledPath).toBe(
      toRemoteVirtualPath('conn:1', '/srv/repo/worktrees/feature-a/.claude/skills.disabled/planner')
    );
  });

  it('accepts remote catalog source paths when the worktree path is virtual', async () => {
    const worktreePath = toRemoteVirtualPath('conn:1', '/srv/repo/worktrees/feature-a');
    remoteRepositoryBackend.exists.mockResolvedValue(false);

    const result = await disableWorkspaceNativeClaudeSkill({
      worktreePath,
      sourcePath: '/srv/repo/worktrees/feature-a/.claude/skills/planner/SKILL.md',
    });

    expect(remoteRepositoryBackend.rename).toHaveBeenCalledWith(
      toRemoteVirtualPath('conn:1', '/srv/repo/worktrees/feature-a/.claude/skills/planner'),
      toRemoteVirtualPath('conn:1', '/srv/repo/worktrees/feature-a/.claude/skills.disabled/planner')
    );
    expect(result.disabledPath).toBe(
      toRemoteVirtualPath('conn:1', '/srv/repo/worktrees/feature-a/.claude/skills.disabled/planner')
    );
  });

  it('restores a quarantined worktree-native Claude skill directory to the active path', async () => {
    const worktreePath = join(rootDir, 'repo', 'worktrees', 'feature-a');
    const disabledDir = join(worktreePath, '.claude', 'skills.disabled', 'planner');
    const disabledFile = join(disabledDir, 'SKILL.md');
    await mkdir(disabledDir, { recursive: true });
    writeFileSync(disabledFile, '---\nname: planner\n---\n', 'utf8');

    const result = await restoreWorkspaceNativeClaudeSkill({
      worktreePath,
      sourcePath: disabledFile,
    });

    expect(result.ok).toBe(true);
    expect(existsSync(disabledDir)).toBe(false);
    expect(existsSync(result.restoredPath)).toBe(true);
    expect(readFileSync(join(result.restoredPath, 'SKILL.md'), 'utf8')).toContain('name: planner');
  });

  it('does not overwrite an existing active native Claude skill directory when restoring', async () => {
    const worktreePath = join(rootDir, 'repo', 'worktrees', 'feature-a');
    const skillDir = join(worktreePath, '.claude', 'skills', 'planner');
    const disabledDir = join(worktreePath, '.claude', 'skills.disabled', 'planner');
    await mkdir(skillDir, { recursive: true });
    await mkdir(disabledDir, { recursive: true });
    writeFileSync(join(disabledDir, 'SKILL.md'), '---\nname: planner\n---\n', 'utf8');

    await expect(
      restoreWorkspaceNativeClaudeSkill({
        worktreePath,
        sourcePath: join(disabledDir, 'SKILL.md'),
      })
    ).rejects.toThrow('Active skill destination already exists');
  });

  it('restores remote quarantined native Claude skill directories through the remote backend', async () => {
    const worktreePath = toRemoteVirtualPath('conn:1', '/srv/repo/worktrees/feature-a');
    remoteRepositoryBackend.exists.mockResolvedValue(false);

    const result = await restoreWorkspaceNativeClaudeSkill({
      worktreePath,
      sourcePath: '/srv/repo/worktrees/feature-a/.claude/skills.disabled/planner/SKILL.md',
    });

    expect(remoteRepositoryBackend.exists).toHaveBeenCalledWith(
      toRemoteVirtualPath('conn:1', '/srv/repo/worktrees/feature-a/.claude/skills/planner')
    );
    expect(remoteRepositoryBackend.rename).toHaveBeenCalledWith(
      toRemoteVirtualPath(
        'conn:1',
        '/srv/repo/worktrees/feature-a/.claude/skills.disabled/planner'
      ),
      toRemoteVirtualPath('conn:1', '/srv/repo/worktrees/feature-a/.claude/skills/planner')
    );
    expect(result.restoredPath).toBe(
      toRemoteVirtualPath('conn:1', '/srv/repo/worktrees/feature-a/.claude/skills/planner')
    );
  });
});
