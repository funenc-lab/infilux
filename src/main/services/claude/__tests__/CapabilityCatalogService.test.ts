import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { McpServerConfig } from '@shared/types';
import { toRemoteVirtualPath } from '@shared/utils/remotePath';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listClaudeCapabilityCatalog } from '../CapabilityCatalogService';

function writeTextFile(targetPath: string, content: string): void {
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, content, 'utf8');
}

describe('listClaudeCapabilityCatalog', () => {
  const originalHome = process.env.HOME;
  let rootDir: string;
  let userClaudeDir: string;
  let repoPath: string;
  let worktreePath: string;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'infilux-claude-policy-catalog-'));
    process.env.HOME = rootDir;
    userClaudeDir = join(rootDir, 'user-claude');
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

  it('discovers local commands, subagents, skills from all supported roots, and shared/personal MCP sources', async () => {
    writeTextFile(join(userClaudeDir, 'commands', 'user-command.md'), '# User Command\n');
    writeTextFile(
      join(userClaudeDir, 'skills', 'user-skill', 'SKILL.md'),
      ['---', 'name: User Skill', 'description: User legacy skill', '---', '', '# User Skill'].join(
        '\n'
      )
    );
    writeTextFile(
      join(rootDir, '.gemini', 'skills', 'user-gemini-skill', 'SKILL.md'),
      ['---', 'name: User Gemini Skill', 'description: User gemini skill', '---'].join('\n')
    );
    writeTextFile(
      join(rootDir, '.agents', 'skills', 'user-agent-skill', 'SKILL.md'),
      ['---', 'name: User Agent Skill', 'description: User agent skill', '---'].join('\n')
    );
    writeTextFile(
      join(rootDir, '.codex', 'skills', 'user-codex-skill', 'SKILL.md'),
      ['---', 'name: User Codex Skill', 'description: User codex skill', '---'].join('\n')
    );
    writeTextFile(
      join(rootDir, '.codex', 'config.toml'),
      [
        '[mcp_servers.personal-codex-global]',
        'command = "uvx"',
        'args = ["personal-codex-global"]',
        '',
        '[mcp_servers.personal-codex-global.env]',
        'TOKEN = "global-token"',
      ].join('\n')
    );
    writeTextFile(join(userClaudeDir, 'agents', 'user-agent.md'), '# User Agent\n');

    writeTextFile(join(repoPath, '.claude', 'commands', 'project-command.md'), '# Project Command');
    writeTextFile(
      join(repoPath, '.claude', 'skills', 'project-skill', 'SKILL.md'),
      ['---', 'name: Project Skill', 'description: Project legacy skill', '---'].join('\n')
    );
    writeTextFile(
      join(repoPath, '.gemini', 'skills', 'project-gemini-skill', 'SKILL.md'),
      ['---', 'name: Project Gemini Skill', 'description: Project gemini skill', '---'].join('\n')
    );
    writeTextFile(
      join(repoPath, '.agents', 'skills', 'project-agent-skill', 'SKILL.md'),
      ['---', 'name: Project Agent Skill', 'description: Project agent skill', '---'].join('\n')
    );
    writeTextFile(
      join(repoPath, '.codex', 'skills', 'project-codex-skill', 'SKILL.md'),
      ['---', 'name: Project Codex Skill', 'description: Project codex skill', '---'].join('\n')
    );
    writeTextFile(
      join(repoPath, '.codex', 'config.toml'),
      [
        '[mcp_servers.personal-codex-project]',
        'transport = "sse"',
        'url = "https://project.codex.example.com/mcp"',
        '',
        '[mcp_servers.personal-codex-project.headers]',
        'Authorization = "Bearer project-token"',
      ].join('\n')
    );
    writeTextFile(join(repoPath, '.claude', 'agents', 'project-reviewer.md'), '# Project Reviewer');
    writeTextFile(
      join(repoPath, '.mcp.json'),
      JSON.stringify(
        {
          mcpServers: {
            'shared-project': { command: 'npx', args: ['shared-project'] },
          },
        },
        null,
        2
      )
    );

    writeTextFile(
      join(worktreePath, '.claude', 'commands', 'worktree-command.md'),
      '# Worktree Command'
    );
    writeTextFile(
      join(worktreePath, '.claude', 'skills', 'worktree-skill', 'SKILL.md'),
      ['---', 'name: Worktree Skill', 'description: Worktree legacy skill', '---'].join('\n')
    );
    writeTextFile(
      join(worktreePath, '.gemini', 'skills', 'worktree-gemini-skill', 'SKILL.md'),
      ['---', 'name: Worktree Gemini Skill', 'description: Worktree gemini skill', '---'].join('\n')
    );
    writeTextFile(
      join(worktreePath, '.agents', 'skills', 'worktree-agent-skill', 'SKILL.md'),
      ['---', 'name: Worktree Agent Skill', 'description: Worktree agent skill', '---'].join('\n')
    );
    writeTextFile(
      join(worktreePath, '.codex', 'skills', 'worktree-codex-skill', 'SKILL.md'),
      ['---', 'name: Worktree Codex Skill', 'description: Worktree codex skill', '---'].join('\n')
    );
    writeTextFile(
      join(worktreePath, '.codex', 'config.toml'),
      [
        '[mcp_servers.personal-codex-worktree]',
        'command = "uvx"',
        'args = ["personal-codex-worktree"]',
      ].join('\n')
    );
    writeTextFile(join(worktreePath, '.claude', 'agents', 'worktree-agent.md'), '# Worktree Agent');
    writeTextFile(
      join(worktreePath, '.mcp.json'),
      JSON.stringify(
        {
          mcpServers: {
            'shared-worktree': { type: 'http', url: 'https://worktree.example.com/mcp' },
          },
        },
        null,
        2
      )
    );

    const catalog = await listClaudeCapabilityCatalog(
      { repoPath, worktreePath },
      {
        getUserClaudeConfigDirs: () => [userClaudeDir],
        readLocalClaudeJson: async () => ({
          mcpServers: {
            'personal-global': { command: 'uvx', args: ['personal-global'] },
          },
        }),
        readLocalProjectSettings: async (workspacePath) => {
          if (workspacePath === repoPath) {
            const mcpServers: Record<string, McpServerConfig> = {
              'personal-claude-project': {
                command: 'uvx',
                args: ['personal-claude-project'],
              },
            };
            return {
              mcpServers,
            };
          }
          if (workspacePath === worktreePath) {
            const mcpServers: Record<string, McpServerConfig> = {
              'personal-claude-worktree': {
                command: 'uvx',
                args: ['personal-claude-worktree'],
              },
            };
            return {
              mcpServers,
            };
          }
          return null;
        },
        readLocalGeminiSettings: async () => ({
          mcpServers: {
            'personal-gemini-global': { command: 'uvx', args: ['personal-gemini-global'] },
          },
        }),
        readLocalGeminiProjectSettings: async (workspacePath) => ({
          mcpServers:
            workspacePath === repoPath
              ? ({
                  'personal-gemini-project': {
                    command: 'uvx',
                    args: ['personal-gemini-project'],
                  },
                } as Record<string, { command: string; args: string[] }>)
              : ({
                  'personal-gemini-worktree': {
                    command: 'uvx',
                    args: ['personal-gemini-worktree'],
                  },
                } as Record<string, { command: string; args: string[] }>),
        }),
      }
    );

    expect(catalog.capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'command:user-command',
          kind: 'command',
          sourceScope: 'user',
          isAvailable: true,
          isConfigurable: true,
        }),
        expect.objectContaining({
          id: 'legacy-skill:project-skill',
          kind: 'legacy-skill',
          sourceScope: 'project',
        }),
        expect.objectContaining({
          id: 'legacy-skill:user-gemini-skill',
          kind: 'legacy-skill',
          sourceScope: 'user',
          sourcePath: join(rootDir, '.gemini', 'skills', 'user-gemini-skill', 'SKILL.md'),
        }),
        expect.objectContaining({
          id: 'legacy-skill:user-agent-skill',
          kind: 'legacy-skill',
          sourceScope: 'user',
          sourcePath: join(rootDir, '.agents', 'skills', 'user-agent-skill', 'SKILL.md'),
        }),
        expect.objectContaining({
          id: 'legacy-skill:user-codex-skill',
          kind: 'legacy-skill',
          sourceScope: 'user',
          sourcePath: join(rootDir, '.codex', 'skills', 'user-codex-skill', 'SKILL.md'),
        }),
        expect.objectContaining({
          id: 'legacy-skill:project-gemini-skill',
          kind: 'legacy-skill',
          sourceScope: 'project',
          sourcePath: join(repoPath, '.gemini', 'skills', 'project-gemini-skill', 'SKILL.md'),
        }),
        expect.objectContaining({
          id: 'legacy-skill:project-agent-skill',
          kind: 'legacy-skill',
          sourceScope: 'project',
          sourcePath: join(repoPath, '.agents', 'skills', 'project-agent-skill', 'SKILL.md'),
        }),
        expect.objectContaining({
          id: 'legacy-skill:project-codex-skill',
          kind: 'legacy-skill',
          sourceScope: 'project',
          sourcePath: join(repoPath, '.codex', 'skills', 'project-codex-skill', 'SKILL.md'),
        }),
        expect.objectContaining({
          id: 'legacy-skill:worktree-gemini-skill',
          kind: 'legacy-skill',
          sourceScope: 'worktree',
          sourcePath: join(worktreePath, '.gemini', 'skills', 'worktree-gemini-skill', 'SKILL.md'),
        }),
        expect.objectContaining({
          id: 'legacy-skill:worktree-agent-skill',
          kind: 'legacy-skill',
          sourceScope: 'worktree',
          sourcePath: join(worktreePath, '.agents', 'skills', 'worktree-agent-skill', 'SKILL.md'),
        }),
        expect.objectContaining({
          id: 'legacy-skill:worktree-codex-skill',
          kind: 'legacy-skill',
          sourceScope: 'worktree',
          sourcePath: join(worktreePath, '.codex', 'skills', 'worktree-codex-skill', 'SKILL.md'),
        }),
        expect.objectContaining({
          id: 'subagent:worktree-agent',
          kind: 'subagent',
          sourceScope: 'worktree',
        }),
      ])
    );
    expect(catalog.sharedMcpServers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'shared-project',
          sourceScope: 'project',
          transportType: 'stdio',
        }),
        expect.objectContaining({
          id: 'shared-worktree',
          sourceScope: 'worktree',
          transportType: 'http',
        }),
      ])
    );
    expect(catalog.personalMcpServers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'personal-global',
          sourceScope: 'user',
          transportType: 'stdio',
        }),
        expect.objectContaining({
          id: 'personal-gemini-global',
          sourceScope: 'user',
          transportType: 'stdio',
          sourcePath: join(rootDir, '.gemini', 'settings.json'),
        }),
        expect.objectContaining({
          id: 'personal-codex-global',
          sourceScope: 'user',
          transportType: 'stdio',
          sourcePath: join(rootDir, '.codex', 'config.toml'),
        }),
        expect.objectContaining({
          id: 'personal-claude-project',
          sourceScope: 'project',
          transportType: 'stdio',
        }),
        expect.objectContaining({
          id: 'personal-claude-worktree',
          sourceScope: 'worktree',
          transportType: 'stdio',
        }),
        expect.objectContaining({
          id: 'personal-gemini-project',
          sourceScope: 'project',
          transportType: 'stdio',
          sourcePath: join(repoPath, '.gemini', 'settings.json'),
        }),
        expect.objectContaining({
          id: 'personal-codex-project',
          sourceScope: 'project',
          transportType: 'sse',
          sourcePath: join(repoPath, '.codex', 'config.toml'),
        }),
        expect.objectContaining({
          id: 'personal-gemini-worktree',
          sourceScope: 'worktree',
          transportType: 'stdio',
          sourcePath: join(worktreePath, '.gemini', 'settings.json'),
        }),
        expect.objectContaining({
          id: 'personal-codex-worktree',
          sourceScope: 'worktree',
          transportType: 'stdio',
          sourcePath: join(worktreePath, '.codex', 'config.toml'),
        }),
      ])
    );
  });

  it('preserves all discovered source paths for duplicate logical skill ids', async () => {
    writeTextFile(
      join(rootDir, '.agents', 'skills', 'skill-creator', 'SKILL.md'),
      ['---', 'name: Skill Creator', 'description: Agent skill copy', '---'].join('\n')
    );
    writeTextFile(
      join(rootDir, '.codex', 'skills', 'skill-creator', 'SKILL.md'),
      ['---', 'name: Skill Creator', 'description: User skill copy', '---'].join('\n')
    );
    writeTextFile(
      join(rootDir, '.codex', 'skills', '.system', 'skill-creator', 'SKILL.md'),
      ['---', 'name: Skill Creator', 'description: System skill copy', '---'].join('\n')
    );

    const catalog = await listClaudeCapabilityCatalog(
      { repoPath, worktreePath },
      {
        getUserClaudeConfigDirs: () => [userClaudeDir],
        readLocalClaudeJson: async () => null,
        readLocalProjectSettings: async () => null,
        readLocalGeminiSettings: async () => null,
        readLocalGeminiProjectSettings: async () => null,
      }
    );

    const duplicateSkill = catalog.capabilities.find(
      (item) => item.id === 'legacy-skill:skill-creator'
    );

    expect(duplicateSkill).toEqual(
      expect.objectContaining({
        id: 'legacy-skill:skill-creator',
        kind: 'legacy-skill',
        sourcePath: join(rootDir, '.codex', 'skills', 'skill-creator', 'SKILL.md'),
      })
    );
    expect(duplicateSkill?.sourcePaths).toEqual(
      expect.arrayContaining([
        join(rootDir, '.agents', 'skills', 'skill-creator', 'SKILL.md'),
        join(rootDir, '.codex', 'skills', '.system', 'skill-creator', 'SKILL.md'),
        join(rootDir, '.codex', 'skills', 'skill-creator', 'SKILL.md'),
      ])
    );
  });

  it('discovers remote commands, subagents, skills from supported roots, and MCP sources with remote tagging', async () => {
    const remoteRepoPath = toRemoteVirtualPath('connection-1', '/srv/repo');
    const remoteWorktreePath = toRemoteVirtualPath('connection-1', '/srv/repo/worktrees/feature-a');
    const remoteFiles: Record<string, string> = {
      '/home/tester/.claude/commands/user-command.md': '# Remote User Command',
      '/home/tester/.claude/skills/remote-skill/SKILL.md': [
        '---',
        'name: Remote Skill',
        'description: Remote legacy skill',
        '---',
      ].join('\n'),
      '/home/tester/.agents/skills/remote-agent-skill/SKILL.md': [
        '---',
        'name: Remote Agent Skill',
        'description: Remote agent skill',
        '---',
      ].join('\n'),
      '/home/tester/.codex/skills/remote-codex-skill/SKILL.md': [
        '---',
        'name: Remote Codex Skill',
        'description: Remote codex skill',
        '---',
      ].join('\n'),
      '/home/tester/.codex/config.toml': [
        '[mcp_servers.personal-remote-codex-global]',
        'command = "uvx"',
        'args = ["remote-codex-global"]',
      ].join('\n'),
      '/home/tester/.claude/agents/remote-agent.md': '# Remote Agent',
      '/srv/repo/.claude/commands/project-command.md': '# Remote Project Command',
      '/srv/repo/.agents/skills/project-agent-skill/SKILL.md': [
        '---',
        'name: Remote Project Agent Skill',
        'description: Remote project agent skill',
        '---',
      ].join('\n'),
      '/srv/repo/.codex/skills/project-codex-skill/SKILL.md': [
        '---',
        'name: Remote Project Codex Skill',
        'description: Remote project codex skill',
        '---',
      ].join('\n'),
      '/srv/repo/.codex/config.toml': [
        '[mcp_servers.personal-remote-codex-project]',
        'transport = "http"',
        'url = "https://remote-project.codex.example.com/mcp"',
      ].join('\n'),
      '/srv/repo/worktrees/feature-a/.claude/skills/worktree-skill/SKILL.md': [
        '---',
        'name: Remote Worktree Skill',
        'description: Remote worktree legacy skill',
        '---',
      ].join('\n'),
      '/srv/repo/worktrees/feature-a/.agents/skills/worktree-agent-skill/SKILL.md': [
        '---',
        'name: Remote Worktree Agent Skill',
        'description: Remote worktree agent skill',
        '---',
      ].join('\n'),
      '/srv/repo/worktrees/feature-a/.codex/skills/worktree-codex-skill/SKILL.md': [
        '---',
        'name: Remote Worktree Codex Skill',
        'description: Remote worktree codex skill',
        '---',
      ].join('\n'),
      '/srv/repo/worktrees/feature-a/.codex/config.toml': [
        '[mcp_servers.personal-remote-codex-worktree]',
        'command = "uvx"',
        'args = ["remote-codex-worktree"]',
      ].join('\n'),
      '/srv/repo/.mcp.json': JSON.stringify(
        {
          mcpServers: {
            'shared-remote': { command: 'npx', args: ['shared-remote'] },
          },
        },
        null,
        2
      ),
      '/srv/repo/worktrees/feature-a/.mcp.json': JSON.stringify(
        {
          mcpServers: {
            'shared-remote-worktree': {
              type: 'http',
              url: 'https://remote-worktree.example.com/mcp',
            },
          },
        },
        null,
        2
      ),
    };
    const remoteDirectoryEntries: Record<
      string,
      Array<{ path: string; isDirectory: boolean; name: string }>
    > = {
      '/home/tester/.claude/commands': [
        {
          path: '/home/tester/.claude/commands/user-command.md',
          isDirectory: false,
          name: 'user-command.md',
        },
      ],
      '/home/tester/.claude/skills': [
        {
          path: '/home/tester/.claude/skills/remote-skill',
          isDirectory: true,
          name: 'remote-skill',
        },
      ],
      '/home/tester/.claude/skills/remote-skill': [
        {
          path: '/home/tester/.claude/skills/remote-skill/SKILL.md',
          isDirectory: false,
          name: 'SKILL.md',
        },
      ],
      '/home/tester/.agents/skills': [
        {
          path: '/home/tester/.agents/skills/remote-agent-skill',
          isDirectory: true,
          name: 'remote-agent-skill',
        },
      ],
      '/home/tester/.agents/skills/remote-agent-skill': [
        {
          path: '/home/tester/.agents/skills/remote-agent-skill/SKILL.md',
          isDirectory: false,
          name: 'SKILL.md',
        },
      ],
      '/home/tester/.codex/skills': [
        {
          path: '/home/tester/.codex/skills/remote-codex-skill',
          isDirectory: true,
          name: 'remote-codex-skill',
        },
      ],
      '/home/tester/.codex/skills/remote-codex-skill': [
        {
          path: '/home/tester/.codex/skills/remote-codex-skill/SKILL.md',
          isDirectory: false,
          name: 'SKILL.md',
        },
      ],
      '/home/tester/.claude/agents': [
        {
          path: '/home/tester/.claude/agents/remote-agent.md',
          isDirectory: false,
          name: 'remote-agent.md',
        },
      ],
      '/srv/repo/.claude/commands': [
        {
          path: '/srv/repo/.claude/commands/project-command.md',
          isDirectory: false,
          name: 'project-command.md',
        },
      ],
      '/srv/repo/.claude/skills': [],
      '/srv/repo/.agents/skills': [
        {
          path: '/srv/repo/.agents/skills/project-agent-skill',
          isDirectory: true,
          name: 'project-agent-skill',
        },
      ],
      '/srv/repo/.agents/skills/project-agent-skill': [
        {
          path: '/srv/repo/.agents/skills/project-agent-skill/SKILL.md',
          isDirectory: false,
          name: 'SKILL.md',
        },
      ],
      '/srv/repo/.codex/skills': [
        {
          path: '/srv/repo/.codex/skills/project-codex-skill',
          isDirectory: true,
          name: 'project-codex-skill',
        },
      ],
      '/srv/repo/.codex/skills/project-codex-skill': [
        {
          path: '/srv/repo/.codex/skills/project-codex-skill/SKILL.md',
          isDirectory: false,
          name: 'SKILL.md',
        },
      ],
      '/srv/repo/.claude/agents': [],
      '/srv/repo/worktrees/feature-a/.claude/commands': [],
      '/srv/repo/worktrees/feature-a/.claude/skills': [
        {
          path: '/srv/repo/worktrees/feature-a/.claude/skills/worktree-skill',
          isDirectory: true,
          name: 'worktree-skill',
        },
      ],
      '/srv/repo/worktrees/feature-a/.claude/skills/worktree-skill': [
        {
          path: '/srv/repo/worktrees/feature-a/.claude/skills/worktree-skill/SKILL.md',
          isDirectory: false,
          name: 'SKILL.md',
        },
      ],
      '/srv/repo/worktrees/feature-a/.agents/skills': [
        {
          path: '/srv/repo/worktrees/feature-a/.agents/skills/worktree-agent-skill',
          isDirectory: true,
          name: 'worktree-agent-skill',
        },
      ],
      '/srv/repo/worktrees/feature-a/.agents/skills/worktree-agent-skill': [
        {
          path: '/srv/repo/worktrees/feature-a/.agents/skills/worktree-agent-skill/SKILL.md',
          isDirectory: false,
          name: 'SKILL.md',
        },
      ],
      '/srv/repo/worktrees/feature-a/.codex/skills': [
        {
          path: '/srv/repo/worktrees/feature-a/.codex/skills/worktree-codex-skill',
          isDirectory: true,
          name: 'worktree-codex-skill',
        },
      ],
      '/srv/repo/worktrees/feature-a/.codex/skills/worktree-codex-skill': [
        {
          path: '/srv/repo/worktrees/feature-a/.codex/skills/worktree-codex-skill/SKILL.md',
          isDirectory: false,
          name: 'SKILL.md',
        },
      ],
      '/srv/repo/worktrees/feature-a/.claude/agents': [],
    };

    const catalog = await listClaudeCapabilityCatalog(
      {
        repoPath: remoteRepoPath,
        worktreePath: remoteWorktreePath,
      },
      {
        getUserClaudeConfigDirs: () => [],
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
        listRepositoryRemoteDirectory: async (_repoPath, directoryPath) =>
          remoteDirectoryEntries[directoryPath] ?? [],
        readRepositoryRemoteTextFile: async (_repoPath, targetPath) =>
          remoteFiles[targetPath] ?? null,
        readRepositoryClaudeJson: async () => ({
          mcpServers: {
            'personal-remote-global': { command: 'uvx', args: ['remote-global'] },
          },
          projects: {
            '/srv/repo/worktrees/feature-a': {
              mcpServers: {
                'personal-remote': { type: 'http', url: 'https://personal.remote/mcp' },
              },
            },
          },
        }),
      }
    );

    expect(catalog.capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'command:user-command',
          sourceScope: 'remote',
        }),
        expect.objectContaining({
          id: 'legacy-skill:worktree-skill',
          sourceScope: 'remote',
        }),
        expect.objectContaining({
          id: 'legacy-skill:remote-agent-skill',
          sourceScope: 'remote',
        }),
        expect.objectContaining({
          id: 'legacy-skill:remote-codex-skill',
          sourceScope: 'remote',
        }),
        expect.objectContaining({
          id: 'legacy-skill:project-agent-skill',
          sourceScope: 'remote',
        }),
        expect.objectContaining({
          id: 'legacy-skill:project-codex-skill',
          sourceScope: 'remote',
        }),
        expect.objectContaining({
          id: 'legacy-skill:worktree-agent-skill',
          sourceScope: 'remote',
        }),
        expect.objectContaining({
          id: 'legacy-skill:worktree-codex-skill',
          sourceScope: 'remote',
        }),
        expect.objectContaining({
          id: 'subagent:remote-agent',
          sourceScope: 'remote',
        }),
      ])
    );
    expect(catalog.sharedMcpServers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'shared-remote',
          sourceScope: 'remote',
          transportType: 'stdio',
        }),
        expect.objectContaining({
          id: 'shared-remote-worktree',
          sourceScope: 'remote',
          transportType: 'http',
        }),
      ])
    );
    expect(catalog.personalMcpServers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'personal-remote-global',
          sourceScope: 'remote',
          transportType: 'stdio',
        }),
        expect.objectContaining({
          id: 'personal-remote',
          sourceScope: 'remote',
          transportType: 'http',
        }),
        expect.objectContaining({
          id: 'personal-remote-codex-global',
          sourceScope: 'remote',
          transportType: 'stdio',
          sourcePath: '/home/tester/.codex/config.toml',
        }),
        expect.objectContaining({
          id: 'personal-remote-codex-project',
          sourceScope: 'remote',
          transportType: 'http',
          sourcePath: '/srv/repo/.codex/config.toml',
        }),
        expect.objectContaining({
          id: 'personal-remote-codex-worktree',
          sourceScope: 'remote',
          transportType: 'stdio',
          sourcePath: '/srv/repo/worktrees/feature-a/.codex/config.toml',
        }),
      ])
    );
  });
});
