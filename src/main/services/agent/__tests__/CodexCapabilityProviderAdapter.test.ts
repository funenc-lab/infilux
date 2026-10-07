import type {
  AgentCapabilityLaunchRequest,
  ClaudeCapabilityCatalogItem,
  ResolvedClaudePolicy,
  SessionCreateOptions,
} from '@shared/types';
import { toRemoteVirtualPath } from '@shared/utils/remotePath';
import { describe, expect, it, vi } from 'vitest';
import { buildAgentLaunchPlan } from '../../../../renderer/components/chat/agentLaunchPlan';
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

function createNativeShellPlan() {
  return buildAgentLaunchPlan({
    agentCommand: 'codex',
    customArgs: '--profile fast',
    environment: 'native',
    hapiGlobalInstalled: null,
    isRemoteExecution: false,
    executionPlatform: 'darwin',
    resolvedShell: { shell: '/bin/zsh', execArgs: ['-l', '-c'] },
  });
}

describe('CodexCapabilityProviderAdapter', () => {
  it('preserves remote native Codex capability assignments without a local SQLite override', () => {
    const executable = "/opt/O'Brien's tools/codex";
    const plan = buildAgentLaunchPlan({
      agentCommand: 'codex',
      customPath: executable,
      customArgs: '--profile codex',
      initialPrompt: 'review codex logs',
      environment: 'native',
      hapiGlobalInstalled: null,
      isRemoteExecution: true,
      executionPlatform: 'linux',
      resolvedShell: null,
    });
    const projection = buildCodexSessionProjection(
      {
        cwd: toRemoteVirtualPath('connection-1', '/srv/repo/worktree-a'),
        kind: 'agent',
        initialCommand: plan.initialCommand,
        codexLaunch: plan.codexLaunch,
      },
      createCapabilities(),
      createResolvedPolicy({
        allowedSharedMcpIds: ['shared-project'],
        allowedCapabilityIds: ['legacy-skill:ship'],
      }),
      createMcpConfigs()
    );

    expect(projection.applied).toBe(true);
    expect(projection.sessionOverrides?.initialCommand).toContain(
      `'${executable.replace(/'/g, "'\\''")}' -c `
    );
    expect(projection.sessionOverrides?.initialCommand).toContain('mcp_servers.shared-project');
    expect(projection.sessionOverrides?.initialCommand).toContain('skills.config=');
    expect(projection.sessionOverrides?.initialCommand).toContain('--profile codex');
    expect(projection.sessionOverrides?.initialCommand).not.toContain('sqlite_home');
  });

  it('applies capability assignments at the renderer native Codex executable despite profile and prompt words', () => {
    const executable = "/opt/OpenAI's Codex tools/codex";
    const plan = buildAgentLaunchPlan({
      agentCommand: 'codex',
      customPath: executable,
      customArgs: '--profile codex',
      initialPrompt: 'inspect codex',
      environment: 'native',
      hapiGlobalInstalled: null,
      isRemoteExecution: false,
      executionPlatform: 'darwin',
      resolvedShell: { shell: '/bin/zsh', execArgs: ['-l', '-c'] },
    });
    const projection = buildCodexSessionProjection(
      {
        kind: 'agent',
        shell: '/bin/zsh',
        initialCommand: plan.initialCommand,
        codexLaunch: plan.codexLaunch,
      },
      [],
      createResolvedPolicy({ allowedSharedMcpIds: ['shared-project'] }),
      createMcpConfigs()
    );

    expect(projection.applied).toBe(true);
    expect(projection.sessionOverrides?.initialCommand).toContain(
      `'${executable.replace(/'/g, "'\\''")}' -c `
    );
    expect(projection.sessionOverrides?.initialCommand).toContain(' --profile codex ');
    expect(projection.sessionOverrides?.codexLaunch?.kind).toBe('native');
  });

  it('injects MCP and skill runtime configuration into direct codex launches', () => {
    const plan = buildAgentLaunchPlan({
      agentCommand: 'codex',
      resumeSessionId: 'codex-session-1',
      initialized: true,
      terminalSessionId: 'ui-direct-session',
      environment: 'native',
      hapiGlobalInstalled: null,
      isRemoteExecution: false,
      executionPlatform: 'darwin',
      resolvedShell: { shell: '/bin/zsh', execArgs: ['-l', '-c'] },
    });
    const projection = buildCodexSessionProjection(
      {
        cwd: '/repo/worktrees/feat-a',
        kind: 'agent',
        shell: plan.command?.shell,
        args: plan.command?.args,
        fallbackShell: plan.fallbackCommand?.shell,
        fallbackArgs: plan.fallbackCommand?.args,
        codexLaunch: plan.codexLaunch,
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
        'skills.config=[{enabled = true, path = "/repo/.codex/skills/ship/SKILL.md"}]',
        'resume',
        'codex-session-1',
      ])
    );
    expect(projection.sessionOverrides?.fallbackArgs?.at(-1)).toContain(
      'codex -c "mcp_servers.shared-project.transport=\\"stdio\\""'
    );
    expect(projection.sessionOverrides?.fallbackArgs?.at(-1)).toContain(
      ' -c "skills.config=[{enabled = true, path = \\"/repo/.codex/skills/ship/SKILL.md\\"}]"'
    );
  });

  it('does not inject ChatGPT-hosted node repl MCP into an Infilux Codex launch', () => {
    const projection = buildCodexSessionProjection(
      {
        cwd: '/repo/worktrees/feat-a',
        kind: 'agent',
        shell: 'codex',
        args: ['resume', 'codex-session-1'],
      },
      [],
      createResolvedPolicy({
        allowedSharedMcpIds: ['shared-project'],
        allowedPersonalMcpIds: ['node_repl'],
      }),
      {
        ...createMcpConfigs(),
        personalById: {
          node_repl: {
            id: 'node_repl',
            config: {
              command: '/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node_repl',
              env: {
                CODEX_CLI_PATH: '/Applications/ChatGPT.app/Contents/Resources/codex',
              },
            },
            sourceScope: 'user',
          },
        },
      }
    );

    expect(projection.applied).toBe(true);
    expect(projection.sessionOverrides?.metadata?.codexMcpServerIds).toEqual(['shared-project']);
    expect(projection.sessionOverrides?.args).toEqual(
      expect.arrayContaining(['-c', 'mcp_servers.shared-project.command="/bin/echo"'])
    );
    expect(projection.sessionOverrides?.args?.join(' ')).not.toContain('node_repl');
  });

  it('injects explicit disabled skills into Codex runtime configuration', () => {
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
    expect(projection.sessionOverrides?.metadata?.codexSkillIds).toEqual([
      'legacy-skill:skill-creator',
    ]);
    expect(projection.sessionOverrides?.args).toEqual(
      expect.arrayContaining([
        '-c',
        'skills.config=[{enabled = false, path = "/Users/test/.agents/skills/skill-creator/SKILL.md"}, {enabled = false, path = "/Users/test/.codex/skills/.system/skill-creator/SKILL.md"}, {enabled = false, path = "/Users/test/.codex/skills/skill-creator/SKILL.md"}]',
      ])
    );
  });

  it('disables every source path for an explicitly blocked duplicate skill', () => {
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
          sourceScope: 'project',
          sourcePath: '/repo/.agents/skills/skill-creator/SKILL.md',
          sourcePaths: [
            '/Users/test/.codex/skills/skill-creator/SKILL.md',
            '/repo/.agents/skills/skill-creator/SKILL.md',
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
        'skills.config=[{enabled = false, path = "/repo/.agents/skills/skill-creator/SKILL.md"}, {enabled = false, path = "/Users/test/.codex/skills/skill-creator/SKILL.md"}]',
      ])
    );
  });

  it('uses the preferred source path for enabled duplicate skill definitions', () => {
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
          sourceScope: 'worktree',
          sourcePath: '/repo/worktrees/feat-a/.claude/skills/skill-creator/SKILL.md',
          sourcePaths: [
            '/Users/test/.agents/skills/skill-creator/SKILL.md',
            '/Users/test/.codex/skills/.system/skill-creator/SKILL.md',
            '/repo/worktrees/feat-a/.claude/skills/skill-creator/SKILL.md',
          ],
          isAvailable: true,
          isConfigurable: true,
        },
      ],
      createResolvedPolicy({
        allowedCapabilityIds: ['legacy-skill:skill-creator'],
      }),
      createMcpConfigs()
    );

    expect(projection.applied).toBe(true);
    expect(projection.sessionOverrides?.args).toEqual(
      expect.arrayContaining([
        '-c',
        'skills.config=[{enabled = true, path = "/repo/worktrees/feat-a/.claude/skills/skill-creator/SKILL.md"}]',
        'resume',
        'codex-session-1',
      ])
    );
  });

  it('prefers the Codex skill root when duplicate skill definitions exist in the same scope', () => {
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
          sourceScope: 'worktree',
          sourcePath: '/repo/worktrees/feat-a/.claude/skills/skill-creator/SKILL.md',
          sourcePaths: [
            '/repo/worktrees/feat-a/.agents/skills/skill-creator/SKILL.md',
            '/repo/worktrees/feat-a/.claude/skills/skill-creator/SKILL.md',
            '/repo/worktrees/feat-a/.codex/skills/skill-creator/SKILL.md',
          ],
          isAvailable: true,
          isConfigurable: true,
        },
      ],
      createResolvedPolicy({
        allowedCapabilityIds: ['legacy-skill:skill-creator'],
      }),
      createMcpConfigs()
    );

    expect(projection.applied).toBe(true);
    expect(projection.sessionOverrides?.args).toEqual(
      expect.arrayContaining([
        '-c',
        'skills.config=[{enabled = true, path = "/repo/worktrees/feat-a/.codex/skills/skill-creator/SKILL.md"}]',
        'resume',
        'codex-session-1',
      ])
    );
  });

  it('does not inject catalog-default enabled skills into Codex runtime config', () => {
    const projection = buildCodexSessionProjection(
      {
        cwd: '/repo/worktrees/feat-a',
        kind: 'agent',
        shell: 'codex',
        args: ['resume', 'codex-session-1'],
      },
      createCapabilities(),
      createResolvedPolicy({
        allowedCapabilityIds: ['legacy-skill:review', 'legacy-skill:ship'],
        capabilityProvenance: {
          'legacy-skill:review': { source: 'catalog', decision: 'allow' },
          'legacy-skill:ship': { source: 'catalog', decision: 'allow' },
        },
      }),
      {
        sharedById: {},
        personalById: {},
      }
    );

    expect(projection.applied).toBe(false);
    expect(projection.sessionOverrides).toBeUndefined();
  });

  it('warns and prefers the personal configuration when the same MCP id exists in both scopes', () => {
    const plan = createNativeShellPlan();
    const projection = buildCodexSessionProjection(
      {
        cwd: '/repo/worktrees/feat-a',
        kind: 'agent',
        initialCommand: plan.initialCommand,
        shellConfig: { shellType: 'zsh' },
        codexLaunch: plan.codexLaunch,
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

  it('injects runtime config into Windows Codex cmd shim launches', () => {
    const projection = buildCodexSessionProjection(
      {
        cwd: 'C:\\repo\\worktrees\\feat-a',
        kind: 'agent',
        shell: 'C:\\Users\\Tester\\AppData\\Roaming\\npm\\codex.cmd',
        args: ['resume', 'codex-session-1'],
      },
      createCapabilities(),
      createResolvedPolicy({
        allowedCapabilityIds: ['legacy-skill:ship'],
        allowedSharedMcpIds: ['shared-project'],
      }),
      createMcpConfigs()
    );

    expect(projection.applied).toBe(true);
    expect(projection.sessionOverrides?.args).toEqual(
      expect.arrayContaining([
        '-c',
        'mcp_servers.shared-project.transport="stdio"',
        '-c',
        'skills.config=[{enabled = true, path = "/repo/.codex/skills/ship/SKILL.md"}]',
        'resume',
        'codex-session-1',
      ])
    );
  });

  it('injects runtime config into PowerShell custom executable launches', () => {
    const plan = buildAgentLaunchPlan({
      agentCommand: 'codex',
      customPath: 'C:\\Program Files\\OpenAI\\codex.exe',
      resumeSessionId: 'codex-session-9',
      terminalSessionId: 'ui-powershell',
      initialized: true,
      environment: 'native',
      hapiGlobalInstalled: null,
      isRemoteExecution: false,
      executionPlatform: 'win32',
      resolvedShell: { shell: 'pwsh.exe', execArgs: ['-NoLogo', '-Command'] },
    });
    const projection = buildCodexSessionProjection(
      {
        cwd: 'C:\\repo\\worktrees\\feat-a',
        kind: 'agent',
        shell: 'pwsh.exe',
        args: plan.command?.args,
        codexLaunch: plan.codexLaunch,
      },
      createCapabilities(),
      createResolvedPolicy({
        allowedCapabilityIds: ['legacy-skill:ship'],
        allowedSharedMcpIds: ['shared-project'],
      }),
      createMcpConfigs()
    );

    expect(projection.applied).toBe(true);
    const injectedCommand = projection.sessionOverrides?.args?.at(-1);
    expect(injectedCommand).toContain(
      "& 'C:\\Program Files\\OpenAI\\codex.exe' -c 'mcp_servers.shared-project.transport=\"stdio\"'"
    );
    expect(injectedCommand).toContain(
      '-c \'skills.config=[{enabled = true, path = "/repo/.codex/skills/ship/SKILL.md"}]\' resume codex-session-9'
    );
  });

  it('ignores unsupported command and subagent entries when building Codex runtime skill config', () => {
    const plan = createNativeShellPlan();
    const projection = buildCodexSessionProjection(
      {
        cwd: '/repo/worktrees/feat-a',
        kind: 'agent',
        initialCommand: plan.initialCommand,
        shellConfig: { shellType: 'zsh' },
        codexLaunch: plan.codexLaunch,
      },
      createCapabilities({ includeCommand: true }),
      createResolvedPolicy({
        allowedCapabilityIds: ['legacy-skill:ship'],
        blockedCapabilityIds: ['command:help'],
      }),
      createMcpConfigs()
    );

    expect(projection.applied).toBe(true);
    expect(projection.warnings).toEqual([]);
  });

  it('resolves policy and MCP sources through the adapter and returns provider-native launch metadata', async () => {
    const listClaudeCapabilityCatalog = vi.fn().mockResolvedValue({
      capabilities: createCapabilities({ includeCommand: true }),
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
    const codexRuntimeHomeService = {
      prepareRuntimeHome: vi.fn().mockResolvedValue({
        homePath: '/runtime/codex/ui-session-1',
        sourceHomePath: '/Users/test/.codex',
        sqliteHomePath: '/history/worktree-a/sqlite',
      }),
    };
    const adapter = createCodexCapabilityProviderAdapter({
      listClaudeCapabilityCatalog,
      resolveClaudePolicy: resolveClaudePolicyFn,
      resolveCapabilityMcpConfigEntries: resolveCapabilityMcpConfigEntriesFn,
      codexRuntimeHomeService,
    });
    const plan = createNativeShellPlan();
    const sessionOptions: SessionCreateOptions = {
      cwd: '/repo/worktrees/feat-a',
      kind: 'agent',
      initialCommand: plan.initialCommand,
      shellConfig: { shellType: 'zsh' },
      codexLaunch: plan.codexLaunch,
      metadata: {
        uiSessionId: 'ui-session-1',
      },
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
    expect(
      resolveClaudePolicyFn.mock.calls[0]?.[0].catalog.capabilities.map(
        (item: ClaudeCapabilityCatalogItem) => item.kind
      )
    ).toEqual(['legacy-skill', 'legacy-skill']);
    expect(resolveCapabilityMcpConfigEntriesFn).toHaveBeenCalledWith({
      repoPath: '/repo',
      worktreePath: '/repo/worktrees/feat-a',
    });
    expect(codexRuntimeHomeService.prepareRuntimeHome).toHaveBeenCalledWith('ui-session-1', {
      sessionHistoryPath: expect.stringContaining('codex-session-histories'),
      sessionHistoryScope: {
        repoPath: '/repo',
        worktreePath: '/repo/worktrees/feat-a',
      },
    });
    expect(result.launchResult).toMatchObject({
      provider: 'codex',
      hash: 'hash-1',
      projected: {
        materializationMode: 'provider-native',
        applied: true,
      },
    });
    expect(result.launchResult.warnings).toEqual([]);
    expect(result.sessionOverrides).toMatchObject({
      metadata: {
        providerLaunchStrategy: 'codex-runtime-config',
        codexMcpServerIds: ['shared-project'],
        codexSkillIds: ['legacy-skill:ship'],
        codexRuntimeHome: {
          homePath: '/runtime/codex/ui-session-1',
          sourceHomePath: '/Users/test/.codex',
        },
      },
      env: {
        CODEX_HOME: '/runtime/codex/ui-session-1',
        CODEX_SQLITE_HOME: '/history/worktree-a/sqlite',
        INFILUX_MANAGED_CODEX_RUNTIME_HOME: '/runtime/codex/ui-session-1',
      },
    });
    expect(result.sessionOverrides?.initialCommand).toContain(
      'mcp_servers.shared-project.command=\\"/bin/echo\\"'
    );
    expect(result.sessionOverrides?.initialCommand).toContain(
      'skills.config=[{enabled = true, path = \\"/repo/.codex/skills/ship/SKILL.md\\"}]'
    );
  });

  it('retains a user-owned CODEX_HOME when a Codex capability launch was requested', async () => {
    const runtime = { prepareRuntimeHome: vi.fn() };
    const adapter = createCodexCapabilityProviderAdapter({
      listClaudeCapabilityCatalog: vi.fn().mockResolvedValue({
        capabilities: [],
        sharedMcpServers: [],
        personalMcpServers: [],
        generatedAt: 1,
      }),
      resolveClaudePolicy: vi.fn().mockReturnValue(createResolvedPolicy()),
      resolveCapabilityMcpConfigEntries: vi
        .fn()
        .mockResolvedValue({ sharedById: {}, personalById: {} }),
      codexRuntimeHomeService: runtime,
    });

    const prepared = await adapter.prepareLaunch(createRequest(), {
      cwd: '/repo/worktrees/feat-a',
      kind: 'agent',
      shell: 'codex',
      env: { CODEX_HOME: '/custom/codex-home' },
    });

    expect(runtime.prepareRuntimeHome).not.toHaveBeenCalled();
    expect(prepared?.sessionOverrides?.env?.CODEX_HOME).toBeUndefined();
    expect(prepared?.sessionOverrides?.env?.CODEX_SQLITE_HOME).toBeUndefined();
  });

  it.each([
    'hapi',
    'happy',
  ] as const)('warns when %s wrapper cannot guarantee the managed SQLite index', async (environment) => {
    const adapter = createCodexCapabilityProviderAdapter({
      listClaudeCapabilityCatalog: vi.fn().mockResolvedValue({
        capabilities: [],
        sharedMcpServers: [],
        personalMcpServers: [],
        generatedAt: 1,
      }),
      resolveClaudePolicy: vi.fn().mockReturnValue(createResolvedPolicy()),
      resolveCapabilityMcpConfigEntries: vi
        .fn()
        .mockResolvedValue({ sharedById: {}, personalById: {} }),
      codexRuntimeHomeService: {
        prepareRuntimeHome: vi.fn().mockResolvedValue({
          homePath: '/runtime/codex/ui-session-1',
          sourceHomePath: '/Users/test/.codex',
          sqliteHomePath: '/history/worktree-a/sqlite',
        }),
      },
    });
    const plan = buildAgentLaunchPlan({
      agentCommand: 'codex',
      environment,
      hapiGlobalInstalled: true,
      isRemoteExecution: false,
      executionPlatform: 'darwin',
      tmuxEnabled: true,
      terminalSessionId: 'ui-session-1',
      resolvedShell: { shell: '/bin/zsh', execArgs: ['-l', '-c'] },
    });

    const result = await adapter.prepareLaunch(createRequest(), {
      cwd: '/repo/worktrees/feat-a',
      kind: 'agent',
      shell: plan.command?.shell,
      args: plan.command?.args,
      hostSession: plan.hostSession,
      codexLaunch: plan.codexLaunch,
      metadata: { uiSessionId: 'ui-session-1' },
    });

    expect(result?.sessionOverrides?.env?.CODEX_HOME).toBe('/runtime/codex/ui-session-1');
    expect(result?.sessionOverrides?.env).not.toHaveProperty('CODEX_SQLITE_HOME');
    expect(result?.launchResult.warnings).toContainEqual(
      expect.stringContaining('SQLite index isolation')
    );
  });

  it('does not forward the local managed SQLite path to a remote capability launch', async () => {
    const adapter = createCodexCapabilityProviderAdapter({
      listClaudeCapabilityCatalog: vi.fn().mockResolvedValue({
        capabilities: [],
        sharedMcpServers: [],
        personalMcpServers: [],
        generatedAt: 1,
      }),
      resolveClaudePolicy: vi.fn().mockReturnValue(createResolvedPolicy()),
      resolveCapabilityMcpConfigEntries: vi
        .fn()
        .mockResolvedValue({ sharedById: {}, personalById: {} }),
      codexRuntimeHomeService: {
        prepareRuntimeHome: vi.fn().mockResolvedValue({
          homePath: '/runtime/codex/ui-session-1',
          sourceHomePath: '/Users/test/.codex',
          sqliteHomePath: '/history/worktree-a/sqlite',
        }),
      },
    });
    const remotePath = toRemoteVirtualPath('connection-1', '/repo/worktrees/feat-a');

    const result = await adapter.prepareLaunch(
      { ...createRequest(), worktreePath: remotePath },
      {
        cwd: remotePath,
        kind: 'agent',
        initialCommand: 'codex',
        metadata: { uiSessionId: 'ui-session-1' },
      }
    );

    expect(result?.sessionOverrides?.env?.CODEX_HOME).toBe('/runtime/codex/ui-session-1');
    expect(result?.sessionOverrides?.env).not.toHaveProperty('CODEX_SQLITE_HOME');
  });

  it('uses the actual remote cwd when the capability request has a stale local worktree path', async () => {
    const adapter = createCodexCapabilityProviderAdapter({
      listClaudeCapabilityCatalog: vi.fn().mockResolvedValue({
        capabilities: [],
        sharedMcpServers: [],
        personalMcpServers: [],
        generatedAt: 1,
      }),
      resolveClaudePolicy: vi.fn().mockReturnValue(createResolvedPolicy()),
      resolveCapabilityMcpConfigEntries: vi
        .fn()
        .mockResolvedValue({ sharedById: {}, personalById: {} }),
      codexRuntimeHomeService: {
        prepareRuntimeHome: vi.fn().mockResolvedValue({
          homePath: '/runtime/codex/ui-session-1',
          sourceHomePath: '/Users/test/.codex',
          sqliteHomePath: '/history/worktree-a/sqlite',
        }),
      },
    });

    const result = await adapter.prepareLaunch(createRequest(), {
      cwd: toRemoteVirtualPath('connection-1', '/srv/repo/worktree-a'),
      kind: 'agent',
      initialCommand: 'codex',
      metadata: { uiSessionId: 'ui-session-1' },
    });

    expect(result?.sessionOverrides?.env?.CODEX_HOME).toBe('/runtime/codex/ui-session-1');
    expect(result?.sessionOverrides?.env).not.toHaveProperty('CODEX_SQLITE_HOME');
  });

  it('scopes managed native Codex SQLite history to the actual local cwd despite a stale remote request', async () => {
    const runtimeHomeService = {
      prepareRuntimeHome: vi.fn().mockResolvedValue({
        homePath: '/runtime/codex/ui-session-1',
        sourceHomePath: '/Users/test/.codex',
        sqliteHomePath: '/history/actual-local-worktree/sqlite',
      }),
    };
    const adapter = createCodexCapabilityProviderAdapter({
      listClaudeCapabilityCatalog: vi.fn().mockResolvedValue({
        capabilities: [],
        sharedMcpServers: [],
        personalMcpServers: [],
        generatedAt: 1,
      }),
      resolveClaudePolicy: vi.fn().mockReturnValue(createResolvedPolicy()),
      resolveCapabilityMcpConfigEntries: vi
        .fn()
        .mockResolvedValue({ sharedById: {}, personalById: {} }),
      codexRuntimeHomeService: runtimeHomeService,
    });
    const localCwd = '/repo/worktrees/feat-a';
    const staleRemotePath = toRemoteVirtualPath('connection-1', '/srv/repo/worktree-a');

    const result = await adapter.prepareLaunch(
      { ...createRequest(), worktreePath: staleRemotePath },
      { cwd: localCwd, kind: 'agent', shell: 'codex', metadata: { uiSessionId: 'ui-session-1' } }
    );

    expect(runtimeHomeService.prepareRuntimeHome).toHaveBeenCalledWith('ui-session-1', {
      sessionHistoryPath: expect.stringContaining('codex-session-histories'),
      sessionHistoryScope: { repoPath: '/repo', worktreePath: localCwd },
    });
    expect(result?.sessionOverrides?.env?.CODEX_HOME).toBe('/runtime/codex/ui-session-1');
    expect(result?.sessionOverrides?.env?.CODEX_SQLITE_HOME).toBe(
      '/history/actual-local-worktree/sqlite'
    );
  });
});
