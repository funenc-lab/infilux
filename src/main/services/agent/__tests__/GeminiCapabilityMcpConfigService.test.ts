import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { toRemoteVirtualPath } from '@shared/utils/remotePath';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveGeminiCapabilityMcpConfigEntries } from '../GeminiCapabilityMcpConfigService';

function writeTextFile(targetPath: string, content: string): void {
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, content, 'utf8');
}

describe('resolveGeminiCapabilityMcpConfigEntries', () => {
  const originalHome = process.env.HOME;
  let rootDir: string;
  let repoPath: string;
  let worktreePath: string;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'infilux-gemini-capability-mcp-config-'));
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

  it('includes Claude and Codex MCP entries in local Gemini runtime config resolution', async () => {
    writeTextFile(
      join(rootDir, '.claude.json'),
      JSON.stringify({
        mcpServers: {
          'claude-global': { command: 'uvx', args: ['claude-global'] },
        },
        projects: {
          [repoPath]: {
            mcpServers: {
              'claude-project': { command: 'uvx', args: ['claude-project'] },
            },
          },
          [worktreePath]: {
            mcpServers: {
              'claude-worktree': { command: 'uvx', args: ['claude-worktree'] },
            },
          },
        },
      })
    );
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

    const configSet = await resolveGeminiCapabilityMcpConfigEntries(
      { repoPath, worktreePath },
      {
        readLocalGeminiSettings: async () => ({
          mcpServers: {
            'gemini-global': { command: 'uvx', args: ['gemini-global'] },
          },
        }),
        readLocalGeminiWorkspaceSettings: async () => ({
          mcpServers: {
            'gemini-workspace': { command: 'uvx', args: ['gemini-workspace'] },
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
    expect(configSet.personalById['gemini-global']).toEqual(
      expect.objectContaining({
        id: 'gemini-global',
        sourceScope: 'user',
      })
    );
    expect(configSet.personalById['claude-global']).toEqual(
      expect.objectContaining({
        id: 'claude-global',
        sourceScope: 'user',
        sourcePath: join(rootDir, '.claude.json'),
      })
    );
    expect(configSet.personalById['claude-project']).toEqual(
      expect.objectContaining({
        id: 'claude-project',
        sourceScope: 'project',
        sourcePath: join(rootDir, '.claude.json'),
      })
    );
    expect(configSet.personalById['claude-worktree']).toEqual(
      expect.objectContaining({
        id: 'claude-worktree',
        sourceScope: 'worktree',
        sourcePath: join(rootDir, '.claude.json'),
      })
    );
  });

  it('includes Codex config.toml MCP entries in remote Gemini runtime config resolution', async () => {
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

    const configSet = await resolveGeminiCapabilityMcpConfigEntries(
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
      }
    );

    expect(configSet.personalById['remote-codex-global']).toEqual(
      expect.objectContaining({
        id: 'remote-codex-global',
        sourceScope: 'user',
        sourcePath: '/home/tester/.codex/config.toml',
      })
    );
    expect(configSet.personalById['remote-codex-project']).toEqual(
      expect.objectContaining({
        id: 'remote-codex-project',
        sourceScope: 'project',
        sourcePath: '/srv/repo/.codex/config.toml',
      })
    );
    expect(configSet.personalById['remote-codex-worktree']).toEqual(
      expect.objectContaining({
        id: 'remote-codex-worktree',
        sourceScope: 'worktree',
        sourcePath: '/srv/repo/worktrees/feature-a/.codex/config.toml',
      })
    );
  });
});
