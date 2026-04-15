import type {
  AgentCapabilityLaunchRequest,
  ClaudeCapabilityCatalogItem,
  ResolvedClaudePolicy,
  SessionCreateOptions,
} from '@shared/types';
import { describe, expect, it, vi } from 'vitest';
import type { CapabilityMcpConfigSet } from '../../claude/CapabilityMcpConfigService';
import {
  buildCodexSessionProjection,
  createCodexCapabilityProviderAdapter,
} from '../CodexCapabilityProviderAdapter';

function createRequest(): AgentCapabilityLaunchRequest {
  return {
    provider: 'codex',
    agentId: 'codex',
    agentCommand: 'codex',
    repoPath: '/repo',
    worktreePath: '/repo/worktrees/feat-a',
    globalPolicy: null,
    projectPolicy: null,
    worktreePolicy: null,
    sessionPolicy: null,
    materializationMode: 'provider-native',
  };
}

function createResolvedPolicy(partial: Partial<ResolvedClaudePolicy> = {}): ResolvedClaudePolicy {
  return {
    repoPath: '/repo',
    worktreePath: '/repo/worktrees/feat-a',
    allowedCapabilityIds: [],
    blockedCapabilityIds: [],
    allowedSharedMcpIds: [],
    blockedSharedMcpIds: [],
    allowedPersonalMcpIds: [],
    blockedPersonalMcpIds: [],
    capabilityProvenance: {},
    sharedMcpProvenance: {},
    personalMcpProvenance: {},
    hash: 'hash-1',
    policyHash: 'hash-1',
    ...partial,
  };
}

function createMcpConfigs(): CapabilityMcpConfigSet {
  return {
    sharedById: {
      'shared-project': {
        id: 'shared-project',
        config: {
          command: '/bin/echo',
          args: ['hello'],
          env: {
            HELLO: 'world',
          },
        },
        sourceScope: 'project',
        sourcePath: '/repo/.mcp.json',
      },
    },
    personalById: {},
  };
}

function createCapabilities(
  options: { includeCommand?: boolean } = {}
): ClaudeCapabilityCatalogItem[] {
  const capabilities: ClaudeCapabilityCatalogItem[] = [
    {
      id: 'legacy-skill:ship',
      kind: 'legacy-skill',
      name: 'Ship',
      description: 'Ship the release',
      sourceScope: 'project',
      sourcePath: '/repo/.codex/skills/ship/SKILL.md',
      isAvailable: true,
      isConfigurable: true,
    },
    {
      id: 'legacy-skill:review',
      kind: 'legacy-skill',
      name: 'Review',
      description: 'Review the change',
      sourceScope: 'worktree',
      sourcePath: '/repo/worktrees/feat-a/.codex/skills/review/SKILL.md',
      isAvailable: true,
      isConfigurable: true,
    },
  ];

  if (options.includeCommand) {
    capabilities.push({
      id: 'command:help',
      kind: 'command',
      name: 'Help',
      description: 'Help command',
      sourceScope: 'system',
      isAvailable: true,
      isConfigurable: false,
    });
  }

  return capabilities;
}

describe('CodexCapabilityProviderAdapter', () => {
  it('injects MCP and skill runtime configuration into direct codex launches', () => {
    const projection = buildCodexSessionProjection(
      {
        cwd: '/repo/worktrees/feat-a',
        kind: 'agent',
        shell: 'codex',
        args: ['resume', 'codex-session-1'],
        fallbackShell: '/bin/zsh',
        fallbackArgs: ['-l', '-c', 'codex resume codex-session-1'],
      },
      createCapabilities(),
      createResolvedPolicy({
        allowedCapabilityIds: ['legacy-skill:ship'],
        allowedSharedMcpIds: ['shared-project'],
      }),
      createMcpConfigs()
    );

    expect(projection.applied).toBe(true);
    expect(projection.warnings).toEqual([]);
    expect(projection.sessionOverrides?.args).toEqual(
      expect.arrayContaining([
        '-c',
        'mcp_servers.shared-project.transport="stdio"',
        '-c',
        'mcp_servers.shared-project.command="/bin/echo"',
        '-c',
        'mcp_servers.shared-project.args=["hello"]',
        '-c',
        'mcp_servers.shared-project.env={HELLO = "world"}',
        '-c',
        'mcp_servers.shared-project.enabled=true',
        '-c',
        'skills.config=[{enabled = false, path = "/repo/worktrees/feat-a/.codex/skills/review/SKILL.md"}, {enabled = true, path = "/repo/.codex/skills/ship/SKILL.md"}]',
        'resume',
        'codex-session-1',
      ])
    );
    expect(projection.sessionOverrides?.fallbackArgs?.at(-1)).toContain(
      'codex -c "mcp_servers.shared-project.transport=\\"stdio\\""'
    );
    expect(projection.sessionOverrides?.fallbackArgs?.at(-1)).toContain(
      ' -c "skills.config=[{enabled = false, path = \\"/repo/worktrees/feat-a/.codex/skills/review/SKILL.md\\"}, {enabled = true, path = \\"/repo/.codex/skills/ship/SKILL.md\\"}]"'
    );
  });

  it('injects every discovered source path for the same logical skill id', () => {
    const projection = buildCodexSessionProjection(
      {
        cwd: '/repo/worktrees/feat-a',
        kind: 'agent',
        shell: 'codex',
        args: ['resume', 'codex-session-1'],
      },
      [
        {
          id: 'legacy-skill:skill-creator',
          kind: 'legacy-skill',
          name: 'Skill Creator',
          description: 'Create skills',
          sourceScope: 'user',
          sourcePath: '/Users/test/.codex/skills/skill-creator/SKILL.md',
          sourcePaths: [
            '/Users/test/.agents/skills/skill-creator/SKILL.md',
            '/Users/test/.codex/skills/.system/skill-creator/SKILL.md',
            '/Users/test/.codex/skills/skill-creator/SKILL.md',
          ],
          isAvailable: true,
          isConfigurable: true,
        },
      ],
      createResolvedPolicy({
        blockedCapabilityIds: ['legacy-skill:skill-creator'],
      }),
      createMcpConfigs()
    );

    expect(projection.applied).toBe(true);
    expect(projection.sessionOverrides?.args).toEqual(
      expect.arrayContaining([
        '-c',
        'skills.config=[{enabled = false, path = "/Users/test/.agents/skills/skill-creator/SKILL.md"}, {enabled = false, path = "/Users/test/.codex/skills/.system/skill-creator/SKILL.md"}, {enabled = false, path = "/Users/test/.codex/skills/skill-creator/SKILL.md"}]',
        'resume',
        'codex-session-1',
      ])
    );
  });

  it('warns and prefers the personal configuration when the same MCP id exists in both scopes', () => {
    const projection = buildCodexSessionProjection(
      {
        cwd: '/repo/worktrees/feat-a',
        kind: 'agent',
        initialCommand: 'codex',
        shellConfig: { shellType: 'zsh' },
      },
      [],
      createResolvedPolicy({
        allowedSharedMcpIds: ['duplicate-id'],
        allowedPersonalMcpIds: ['duplicate-id'],
      }),
      {
        sharedById: {
          'duplicate-id': {
            id: 'duplicate-id',
            config: { command: '/bin/echo', args: ['shared'] },
            sourceScope: 'project',
          },
        },
        personalById: {
          'duplicate-id': {
            id: 'duplicate-id',
            config: { command: '/bin/echo', args: ['personal'] },
            sourceScope: 'user',
          },
        },
      }
    );

    expect(projection.applied).toBe(true);
    expect(projection.warnings).toEqual([
      'Codex MCP id "duplicate-id" has different shared and personal configurations. The personal scope entry was selected for runtime injection.',
    ]);
    expect(projection.sessionOverrides?.initialCommand).toContain(
      'mcp_servers.duplicate-id.args=[\\"personal\\"]'
    );
  });

  it('skips injection for unsupported shell wrappers and returns a restart warning', () => {
    const projection = buildCodexSessionProjection(
      {
        cwd: 'C:\\repo',
        kind: 'agent',
        initialCommand: '& { codex }',
        shellConfig: { shellType: 'powershell7' },
      },
      [],
      createResolvedPolicy({
        allowedSharedMcpIds: ['shared-project'],
      }),
      createMcpConfigs()
    );

    expect(projection.applied).toBe(false);
    expect(projection.sessionOverrides).toBeUndefined();
    expect(projection.warnings.at(-1)).toBe(
      'Codex runtime capability injection could not match the current session launch shape. Restart the session with a standard Codex launch command to apply MCP overrides.'
    );
  });

  it('warns when command or subagent restrictions cannot be enforced through Codex runtime skill config', () => {
    const projection = buildCodexSessionProjection(
      {
        cwd: '/repo/worktrees/feat-a',
        kind: 'agent',
        initialCommand: 'codex',
        shellConfig: { shellType: 'zsh' },
      },
      createCapabilities({ includeCommand: true }),
      createResolvedPolicy({
        allowedCapabilityIds: ['legacy-skill:ship'],
        blockedCapabilityIds: ['command:help'],
      }),
      createMcpConfigs()
    );

    expect(projection.applied).toBe(true);
    expect(projection.warnings).toContain(
      'Codex runtime capability injection currently supports SKILL.md capabilities only. Command and subagent restrictions were not enforced for: command:help.'
    );
  });

  it('resolves policy and MCP sources through the adapter and returns provider-native launch metadata', async () => {
    const listClaudeCapabilityCatalog = vi.fn().mockResolvedValue({
      capabilities: createCapabilities(),
      sharedMcpServers: [{ id: 'shared-project' }],
      personalMcpServers: [],
      generatedAt: 1,
    });
    const resolveClaudePolicyFn = vi.fn().mockReturnValue(
      createResolvedPolicy({
        allowedCapabilityIds: ['legacy-skill:ship'],
        allowedSharedMcpIds: ['shared-project'],
      })
    );
    const resolveCapabilityMcpConfigEntriesFn = vi.fn().mockResolvedValue(createMcpConfigs());
    const adapter = createCodexCapabilityProviderAdapter({
      listClaudeCapabilityCatalog,
      resolveClaudePolicy: resolveClaudePolicyFn,
      resolveCapabilityMcpConfigEntries: resolveCapabilityMcpConfigEntriesFn,
    });
    const sessionOptions: SessionCreateOptions = {
      cwd: '/repo/worktrees/feat-a',
      kind: 'agent',
      initialCommand: 'codex',
      shellConfig: { shellType: 'zsh' },
    };

    const result = await adapter.prepareLaunch(createRequest(), sessionOptions);

    expect(result).not.toBeNull();
    if (!result) {
      throw new Error('Expected Codex adapter launch result');
    }

    expect(listClaudeCapabilityCatalog).toHaveBeenCalledWith({
      repoPath: '/repo',
      worktreePath: '/repo/worktrees/feat-a',
    });
    expect(resolveClaudePolicyFn).toHaveBeenCalled();
    expect(resolveCapabilityMcpConfigEntriesFn).toHaveBeenCalledWith({
      repoPath: '/repo',
      worktreePath: '/repo/worktrees/feat-a',
    });
    expect(result.launchResult).toMatchObject({
      provider: 'codex',
      hash: 'hash-1',
      projected: {
        materializationMode: 'provider-native',
        applied: true,
      },
    });
    expect(result.sessionOverrides).toMatchObject({
      metadata: {
        providerLaunchStrategy: 'codex-runtime-config',
        codexMcpServerIds: ['shared-project'],
        codexSkillIds: ['legacy-skill:review', 'legacy-skill:ship'],
      },
    });
    expect(result.sessionOverrides?.initialCommand).toContain(
      'mcp_servers.shared-project.command=\\"/bin/echo\\"'
    );
    expect(result.sessionOverrides?.initialCommand).toContain(
      'skills.config=[{enabled = false, path = \\"/repo/worktrees/feat-a/.codex/skills/review/SKILL.md\\"}, {enabled = true, path = \\"/repo/.codex/skills/ship/SKILL.md\\"}]'
    );
  });
});
