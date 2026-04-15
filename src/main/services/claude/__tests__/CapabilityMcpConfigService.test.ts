import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { toRemoteVirtualPath } from '@shared/utils/remotePath';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveCapabilityMcpConfigEntries } from '../CapabilityMcpConfigService';

function writeTextFile(targetPath: string, content: string): void {
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, content, 'utf8');
}

describe('resolveCapabilityMcpConfigEntries', () => {
  const originalHome = process.env.HOME;
  let rootDir: string;
  let repoPath: string;
  let worktreePath: string;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'infilux-capability-mcp-config-'));
    process.env.HOME = rootDir;
    repoPath = join(rootDir, 'repo');
    worktreePath = join(repoPath, 'worktrees', 'feature-a');
  });

  afterEach(() => {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('collects local Codex config.toml MCP entries for user, project, and worktree scopes', async () => {
    writeTextFile(
      join(rootDir, '.codex', 'config.toml'),
      ['[mcp_servers.codex-global]', 'command = "uvx"', 'args = ["codex-global"]'].join('\n')
    );
    writeTextFile(
      join(repoPath, '.codex', 'config.toml'),
      [
        '[mcp_servers.codex-project]',
        'transport = "http"',
        'url = "https://project.codex.example.com/mcp"',
      ].join('\n')
    );
    writeTextFile(
      join(worktreePath, '.codex', 'config.toml'),
      ['[mcp_servers.codex-worktree]', 'command = "uvx"', 'args = ["codex-worktree"]'].join('\n')
    );

    const configSet = await resolveCapabilityMcpConfigEntries(
      { repoPath, worktreePath },
      {
        readLocalClaudeJson: async () => ({
          mcpServers: {
            'claude-global': { command: 'uvx', args: ['claude-global'] },
          },
        }),
        readLocalProjectSettings: async () => ({
          mcpServers: {
            'claude-workspace': { command: 'uvx', args: ['claude-workspace'] },
          },
        }),
      }
    );

    expect(configSet.personalById['codex-global']).toEqual(
      expect.objectContaining({
        id: 'codex-global',
        sourceScope: 'user',
        sourcePath: join(rootDir, '.codex', 'config.toml'),
      })
    );
    expect(configSet.personalById['codex-project']).toEqual(
      expect.objectContaining({
        id: 'codex-project',
        sourceScope: 'project',
        sourcePath: join(repoPath, '.codex', 'config.toml'),
      })
    );
    expect(configSet.personalById['codex-worktree']).toEqual(
      expect.objectContaining({
        id: 'codex-worktree',
        sourceScope: 'worktree',
        sourcePath: join(worktreePath, '.codex', 'config.toml'),
      })
    );
    expect(configSet.personalById['claude-global']).toEqual(
      expect.objectContaining({
        id: 'claude-global',
        sourceScope: 'user',
      })
    );
  });

  it('collects remote Codex config.toml MCP entries for user, project, and worktree paths', async () => {
    const remoteRepoPath = toRemoteVirtualPath('connection-1', '/srv/repo');
    const remoteWorktreePath = toRemoteVirtualPath('connection-1', '/srv/repo/worktrees/feature-a');
    const remoteFiles: Record<string, string> = {
      '/home/tester/.codex/config.toml': [
        '[mcp_servers.remote-codex-global]',
        'command = "uvx"',
        'args = ["remote-codex-global"]',
      ].join('\n'),
      '/srv/repo/.codex/config.toml': [
        '[mcp_servers.remote-codex-project]',
        'transport = "sse"',
        'url = "https://remote-project.codex.example.com/mcp"',
      ].join('\n'),
      '/srv/repo/worktrees/feature-a/.codex/config.toml': [
        '[mcp_servers.remote-codex-worktree]',
        'command = "uvx"',
        'args = ["remote-codex-worktree"]',
      ].join('\n'),
    };

    const configSet = await resolveCapabilityMcpConfigEntries(
      { repoPath: remoteRepoPath, worktreePath: remoteWorktreePath },
      {
        getRepositoryEnvironmentContext: async () => ({
          kind: 'remote',
          connectionId: 'connection-1',
          homeDir: '/home/tester',
          claudeDir: '/home/tester/.claude',
          claudeSettingsPath: '/home/tester/.claude/settings.json',
          claudeJsonPath: '/home/tester/.claude.json',
          claudePromptPath: '/home/tester/.claude/CLAUDE.md',
          claudeCommandsDir: '/home/tester/.claude/commands',
          claudeSkillsDir: '/home/tester/.claude/skills',
        }),
        readRepositoryRemoteTextFile: async (_repoPath, targetPath) =>
          remoteFiles[targetPath] ?? null,
        readRepositoryClaudeJson: async () => ({
          mcpServers: {
            'remote-claude-global': { command: 'uvx', args: ['remote-claude-global'] },
          },
        }),
      }
    );

    expect(configSet.personalById['remote-codex-global']).toEqual(
      expect.objectContaining({
        id: 'remote-codex-global',
        sourceScope: 'remote',
        sourcePath: '/home/tester/.codex/config.toml',
      })
    );
    expect(configSet.personalById['remote-codex-project']).toEqual(
      expect.objectContaining({
        id: 'remote-codex-project',
        sourceScope: 'remote',
        sourcePath: '/srv/repo/.codex/config.toml',
      })
    );
    expect(configSet.personalById['remote-codex-worktree']).toEqual(
      expect.objectContaining({
        id: 'remote-codex-worktree',
        sourceScope: 'remote',
        sourcePath: '/srv/repo/worktrees/feature-a/.codex/config.toml',
      })
    );
    expect(configSet.personalById['remote-claude-global']).toEqual(
      expect.objectContaining({
        id: 'remote-claude-global',
        sourceScope: 'remote',
      })
    );
  });
});
