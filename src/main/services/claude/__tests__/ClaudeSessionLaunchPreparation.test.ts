import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type {
  ClaudeCapabilityCatalog,
  PrepareClaudePolicyLaunchRequest,
  ResolvedClaudePolicy,
} from '@shared/types';
import { toRemoteVirtualPath } from '@shared/utils/remotePath';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type ClaudeRuntimeProjectorDependencies,
  projectClaudeRuntimePolicy,
} from '../ClaudeRuntimeProjector';
import { prepareClaudeAgentLaunch } from '../ClaudeSessionLaunchPreparation';

function writeTextFile(targetPath: string, content: string): void {
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, content, 'utf8');
}

function createCatalog(sourceRoot: string): ClaudeCapabilityCatalog {
  writeTextFile(join(sourceRoot, 'commands', 'ship.md'), '# Ship command');
  writeTextFile(join(sourceRoot, 'agents', 'reviewer.md'), '# Reviewer');
  writeTextFile(
    join(sourceRoot, 'skills', 'ship-skill', 'SKILL.md'),
    ['---', 'name: Ship Skill', 'description: Shipping legacy skill', '---'].join('\n')
  );

  return {
    capabilities: [
      {
        id: 'command:ship',
        kind: 'command',
        name: 'Ship',
        sourceScope: 'project',
        sourcePath: join(sourceRoot, 'commands', 'ship.md'),
        isAvailable: true,
        isConfigurable: true,
      },
      {
        id: 'subagent:reviewer',
        kind: 'subagent',
        name: 'Reviewer',
        sourceScope: 'project',
        sourcePath: join(sourceRoot, 'agents', 'reviewer.md'),
        isAvailable: true,
        isConfigurable: true,
      },
      {
        id: 'legacy-skill:ship-skill',
        kind: 'legacy-skill',
        name: 'Ship Skill',
        sourceScope: 'project',
        sourcePath: join(sourceRoot, 'skills', 'ship-skill', 'SKILL.md'),
        isAvailable: true,
        isConfigurable: true,
      },
    ],
    sharedMcpServers: [
      {
        id: 'shared-alpha',
        name: 'Shared Alpha',
        scope: 'shared',
        sourceScope: 'project',
        transportType: 'stdio',
        isAvailable: true,
        isConfigurable: true,
      },
    ],
    personalMcpServers: [
      {
        id: 'personal-alpha',
        name: 'Personal Alpha',
        scope: 'personal',
        sourceScope: 'user',
        transportType: 'http',
        isAvailable: true,
        isConfigurable: true,
      },
    ],
    generatedAt: 1,
  };
}

function createResolvedPolicy(): ResolvedClaudePolicy {
  return {
    repoPath: '/repo',
    worktreePath: '/repo/worktrees/feature-a',
    allowedCapabilityIds: ['command:ship', 'subagent:reviewer', 'legacy-skill:ship-skill'],
    blockedCapabilityIds: [],
    allowedSharedMcpIds: ['shared-alpha'],
    blockedSharedMcpIds: [],
    allowedPersonalMcpIds: ['personal-alpha'],
    blockedPersonalMcpIds: [],
    capabilityProvenance: {},
    sharedMcpProvenance: {},
    personalMcpProvenance: {},
    hash: 'hash-1',
    policyHash: 'hash-1',
  };
}

describe('projectClaudeRuntimePolicy', () => {
  let rootDir: string;
  let sourceRoot: string;
  let worktreePath: string;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'infilux-claude-projector-'));
    sourceRoot = join(rootDir, 'sources');
    worktreePath = join(rootDir, 'repo', 'worktrees', 'feature-a');
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('writes local runtime artifacts and personal MCP state for the active workspace', async () => {
    const catalog = createCatalog(sourceRoot);
    const updates: Array<{ workspacePath: string; settings: Record<string, unknown> }> = [];

    const result = await projectClaudeRuntimePolicy(
      {
        repoPath: join(rootDir, 'repo'),
        worktreePath,
        materializationMode: 'copy',
        catalog,
        resolvedPolicy: {
          ...createResolvedPolicy(),
          repoPath: join(rootDir, 'repo'),
          worktreePath,
        },
      },
      {
        updateLocalProjectSettings: async (workspacePath, settings) => {
          updates.push({ workspacePath, settings });
          return true;
        },
        sharedMcpConfigById: {
          'shared-alpha': { command: 'npx', args: ['shared-alpha'] },
        },
        personalMcpConfigById: {
          'personal-alpha': { type: 'http', url: 'https://personal.example.com/mcp' },
        },
      }
    );

    expect(result.hash).toBe('hash-1');
    expect(result.materializationMode).toBe('copy');
    expect(result.applied).toBe(true);
    expect(readFileSync(join(worktreePath, '.claude', 'commands', 'ship.md'), 'utf8')).toContain(
      '# Ship command'
    );
    expect(readFileSync(join(worktreePath, '.claude', 'agents', 'reviewer.md'), 'utf8')).toContain(
      '# Reviewer'
    );
    expect(
      readFileSync(join(worktreePath, '.claude', 'skills', 'ship-skill', 'SKILL.md'), 'utf8')
    ).toContain('Ship Skill');
    expect(
      JSON.parse(readFileSync(join(worktreePath, '.mcp.json'), 'utf8')) as Record<string, unknown>
    ).toEqual({
      mcpServers: {
        'shared-alpha': {
          command: 'npx',
          args: ['shared-alpha'],
        },
      },
    });
    expect(updates).toEqual([
      {
        workspacePath: worktreePath,
        settings: {
          mcpServers: {
            'personal-alpha': {
              type: 'http',
              url: 'https://personal.example.com/mcp',
            },
          },
        },
      },
    ]);
    expect(result.updatedFiles).toEqual(
      expect.arrayContaining([
        join(worktreePath, '.claude', 'commands', 'ship.md'),
        join(worktreePath, '.claude', 'agents', 'reviewer.md'),
        join(worktreePath, '.claude', 'skills', 'ship-skill', 'SKILL.md'),
        join(worktreePath, '.mcp.json'),
      ])
    );
  });

  it('skips workspace MCP materialization when native Claude MCP injection is active', async () => {
    const catalog = createCatalog(sourceRoot);
    const updates: Array<{ workspacePath: string; settings: Record<string, unknown> }> = [];

    const result = await projectClaudeRuntimePolicy(
      {
        repoPath: join(rootDir, 'repo'),
        worktreePath,
        materializationMode: 'copy',
        catalog,
        resolvedPolicy: {
          ...createResolvedPolicy(),
          repoPath: join(rootDir, 'repo'),
          worktreePath,
        },
        projectWorkspaceMcp: false,
      },
      {
        updateLocalProjectSettings: async (workspacePath, settings) => {
          updates.push({ workspacePath, settings });
          return true;
        },
        sharedMcpConfigById: {
          'shared-alpha': { command: 'npx', args: ['shared-alpha'] },
        },
        personalMcpConfigById: {
          'personal-alpha': { type: 'http', url: 'https://personal.example.com/mcp' },
        },
      }
    );

    expect(result.applied).toBe(true);
    expect(readFileSync(join(worktreePath, '.claude', 'commands', 'ship.md'), 'utf8')).toContain(
      '# Ship command'
    );
    expect(readFileSync(join(worktreePath, '.claude', 'agents', 'reviewer.md'), 'utf8')).toContain(
      '# Reviewer'
    );
    expect(
      readFileSync(join(worktreePath, '.claude', 'skills', 'ship-skill', 'SKILL.md'), 'utf8')
    ).toContain('Ship Skill');
    expect(result.updatedFiles).toEqual(
      expect.arrayContaining([
        join(worktreePath, '.claude', 'commands', 'ship.md'),
        join(worktreePath, '.claude', 'agents', 'reviewer.md'),
        join(worktreePath, '.claude', 'skills', 'ship-skill', 'SKILL.md'),
      ])
    );
    expect(result.updatedFiles).not.toContain(join(worktreePath, '.mcp.json'));
    expect(() => readFileSync(join(worktreePath, '.mcp.json'), 'utf8')).toThrow();
    expect(updates).toEqual([]);
  });

  it('projects remote runtime artifacts through the remote adapter paths', async () => {
    const remoteRepoPath = toRemoteVirtualPath('connection-1', '/srv/repo');
    const remoteWorktreePath = toRemoteVirtualPath('connection-1', '/srv/repo/worktrees/feature-a');
    const remoteWrites: Array<{ targetPath: string; content: string }> = [];
    const remoteProjectSettings: Array<{
      workspacePath: string;
      settings: Record<string, unknown>;
    }> = [];
    const catalog: ClaudeCapabilityCatalog = {
      capabilities: [
        {
          id: 'command:ship',
          kind: 'command',
          name: 'Ship',
          sourceScope: 'remote',
          sourcePath: '/srv/repo/.claude/commands/ship.md',
          isAvailable: true,
          isConfigurable: true,
        },
      ],
      sharedMcpServers: [
        {
          id: 'shared-alpha',
          name: 'Shared Alpha',
          scope: 'shared',
          sourceScope: 'remote',
          transportType: 'stdio',
          isAvailable: true,
          isConfigurable: true,
        },
      ],
      personalMcpServers: [
        {
          id: 'personal-alpha',
          name: 'Personal Alpha',
          scope: 'personal',
          sourceScope: 'remote',
          transportType: 'stdio',
          isAvailable: true,
          isConfigurable: true,
        },
      ],
      generatedAt: 1,
    };

    const dependencies: ClaudeRuntimeProjectorDependencies = {
      readRepositoryRemoteTextFile: async (_repoPath, targetPath) =>
        targetPath === '/srv/repo/.claude/commands/ship.md' ? '# Remote Ship' : null,
      readRemoteProjectSettings: async () => null,
      writeRepositoryRemoteTextFile: async (_repoPath, targetPath, content) => {
        remoteWrites.push({ targetPath, content });
        return true;
      },
      updateRemoteProjectSettings: async (_repoPath, workspacePath, settings) => {
        remoteProjectSettings.push({ workspacePath, settings });
        return true;
      },
      sharedMcpConfigById: {
        'shared-alpha': { command: 'npx', args: ['shared-alpha'] },
      },
      personalMcpConfigById: {
        'personal-alpha': { command: 'uvx', args: ['personal-alpha'] },
      },
    };

    const result = await projectClaudeRuntimePolicy(
      {
        repoPath: remoteRepoPath,
        worktreePath: remoteWorktreePath,
        materializationMode: 'copy',
        catalog,
        resolvedPolicy: {
          ...createResolvedPolicy(),
          repoPath: remoteRepoPath,
          worktreePath: remoteWorktreePath,
        },
      },
      dependencies
    );

    expect(result.applied).toBe(true);
    expect(result.materializationMode).toBe('copy');
    expect(remoteWrites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetPath: '/srv/repo/worktrees/feature-a/.claude/commands/ship.md',
        }),
        expect.objectContaining({
          targetPath: '/srv/repo/worktrees/feature-a/.mcp.json',
        }),
      ])
    );
    expect(remoteProjectSettings).toEqual([
      {
        workspacePath: '/srv/repo/worktrees/feature-a',
        settings: {
          mcpServers: {
            'personal-alpha': {
              command: 'uvx',
              args: ['personal-alpha'],
            },
          },
        },
      },
    ]);
  });

  it('uses symlink materialization for local skill and command runtime artifacts when requested', async () => {
    const catalog = createCatalog(sourceRoot);
    const result = await projectClaudeRuntimePolicy(
      {
        repoPath: join(rootDir, 'repo'),
        worktreePath,
        materializationMode: 'symlink',
        catalog,
        resolvedPolicy: {
          ...createResolvedPolicy(),
          repoPath: join(rootDir, 'repo'),
          worktreePath,
        },
      },
      {
        readLocalProjectSettings: () => null,
        updateLocalProjectSettings: async () => true,
        sharedMcpConfigById: {
          'shared-alpha': { command: 'npx', args: ['shared-alpha'] },
        },
        personalMcpConfigById: {
          'personal-alpha': { type: 'http', url: 'https://personal.example.com/mcp' },
        },
      }
    );

    expect(result.materializationMode).toBe('symlink');
    expect(readFileSync(join(worktreePath, '.mcp.json'), 'utf8')).toContain('"shared-alpha"');
    expect(readFileSync(join(worktreePath, '.claude', 'commands', 'ship.md'), 'utf8')).toContain(
      '# Ship command'
    );
    expect(
      readFileSync(join(worktreePath, '.claude', 'skills', 'ship-skill', 'SKILL.md'), 'utf8')
    ).toContain('Ship Skill');
    expect(lstatSync(join(worktreePath, '.claude', 'commands', 'ship.md')).isSymbolicLink()).toBe(
      true
    );
    expect(lstatSync(join(worktreePath, '.claude', 'agents', 'reviewer.md')).isSymbolicLink()).toBe(
      true
    );
    expect(lstatSync(join(worktreePath, '.claude', 'skills', 'ship-skill')).isSymbolicLink()).toBe(
      true
    );
  });

  it('does not delete workspace-owned source files that collide with runtime targets', async () => {
    const repoPath = join(rootDir, 'repo');
    const sourceCommandPath = join(repoPath, '.claude', 'commands', 'ship.md');
    const sourceManifestPath = join(repoPath, '.claude', '.infilux-claude-policy.json');
    writeTextFile(sourceCommandPath, '# Workspace Ship');
    writeTextFile(
      sourceManifestPath,
      JSON.stringify({ managedFiles: [sourceCommandPath] }, null, 2)
    );

    const result = await projectClaudeRuntimePolicy(
      {
        repoPath,
        worktreePath: repoPath,
        materializationMode: 'copy',
        catalog: {
          capabilities: [
            {
              id: 'command:ship',
              kind: 'command',
              name: 'Ship',
              sourceScope: 'project',
              sourcePath: sourceCommandPath,
              isAvailable: true,
              isConfigurable: true,
            },
          ],
          sharedMcpServers: [],
          personalMcpServers: [],
          generatedAt: 1,
        },
        resolvedPolicy: {
          repoPath,
          worktreePath: repoPath,
          allowedCapabilityIds: [],
          blockedCapabilityIds: ['command:ship'],
          allowedSharedMcpIds: [],
          blockedSharedMcpIds: [],
          allowedPersonalMcpIds: [],
          blockedPersonalMcpIds: [],
          capabilityProvenance: {
            'command:ship': {
              source: 'project-policy',
              decision: 'block',
            },
          },
          sharedMcpProvenance: {},
          personalMcpProvenance: {},
          hash: 'hash-protected',
          policyHash: 'hash-protected',
        },
      },
      {
        readLocalProjectSettings: () => null,
        updateLocalProjectSettings: async () => true,
      }
    );

    expect(result.updatedFiles).not.toContain(sourceCommandPath);
    expect(readFileSync(sourceCommandPath, 'utf8')).toContain('# Workspace Ship');
    expect(JSON.parse(readFileSync(sourceManifestPath, 'utf8'))).toEqual({
      managedFiles: [join(repoPath, '.mcp.json')],
    });
  });
});

describe('prepareClaudeAgentLaunch', () => {
  it('resolves policy, projects runtime files, and returns hash/projection details', async () => {
    const request: PrepareClaudePolicyLaunchRequest = {
      agentId: 'claude',
      agentCommand: 'claude',
      repoPath: '/repo',
      worktreePath: '/repo/worktrees/feature-a',
      projectPolicy: null,
      worktreePolicy: null,
      sessionPolicy: {
        allowedCapabilityIds: ['legacy-skill:ship-skill'],
        blockedCapabilityIds: [],
        allowedSharedMcpIds: [],
        blockedSharedMcpIds: [],
        allowedPersonalMcpIds: [],
        blockedPersonalMcpIds: [],
        updatedAt: 3,
      },
      materializationMode: 'symlink',
    };
    const catalog = createCatalog(join(tmpdir(), 'infilux-prepare-catalog'));
    const resolved = createResolvedPolicy();

    const result = await prepareClaudeAgentLaunch(request, {
      listClaudeCapabilityCatalog: async (params) => {
        expect(params).toEqual({
          repoPath: '/repo',
          worktreePath: '/repo/worktrees/feature-a',
        });
        return catalog;
      },
      resolveClaudePolicy: (params) => {
        expect(params.catalog).toBe(catalog);
        expect(params.sessionPolicy).toEqual({
          allowedCapabilityIds: ['legacy-skill:ship-skill'],
          blockedCapabilityIds: [],
          allowedSharedMcpIds: [],
          blockedSharedMcpIds: [],
          allowedPersonalMcpIds: [],
          blockedPersonalMcpIds: [],
          updatedAt: 3,
        });
        return resolved;
      },
      projectClaudeRuntimePolicy: async (params) => {
        expect(params.materializationMode).toBe('symlink');
        return {
          hash: 'hash-1',
          materializationMode: 'symlink',
          applied: true,
          updatedFiles: ['/repo/worktrees/feature-a/.mcp.json'],
          warnings: ['warn-1'],
          errors: [],
        };
      },
    });

    expect(result.hash).toBe('hash-1');
    expect(result.projected).toEqual({
      hash: 'hash-1',
      materializationMode: 'symlink',
      applied: true,
      updatedFiles: ['/repo/worktrees/feature-a/.mcp.json'],
      warnings: ['warn-1'],
      errors: [],
    });
    expect(result.warnings).toEqual(['warn-1']);
    expect(result.resolvedPolicy).toBe(resolved);
  });
});
