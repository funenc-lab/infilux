import * as fs from 'node:fs';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type {
  AgentCapabilityLaunchRequest,
  ClaudeCapabilityCatalogItem,
  ResolvedClaudePolicy,
} from '@shared/types';
import { toRemoteVirtualPath } from '@shared/utils/remotePath';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { remoteConnectionManager } from '../../remote/RemoteConnectionManager';
import { createGeminiCapabilityProviderAdapter } from '../GeminiCapabilityProviderAdapter';

vi.mock('../../remote/RemoteConnectionManager', () => ({
  remoteConnectionManager: {
    call: vi.fn(),
  },
}));

function writeTextFile(targetPath: string, content: string): void {
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, content, 'utf8');
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

function getGeminiRuntimeHome(result: unknown): string {
  const runtimeHome = (
    result as {
      sessionOverrides?: { env?: { GEMINI_CLI_HOME?: unknown } };
    } | null
  )?.sessionOverrides?.env?.GEMINI_CLI_HOME;
  if (typeof runtimeHome !== 'string') {
    throw new Error('Expected Gemini runtime home');
  }
  return runtimeHome;
}

describe('GeminiCapabilityProviderAdapter', () => {
  const originalGeminiCliHome = process.env.GEMINI_CLI_HOME;
  const originalHome = process.env.HOME;
  let rootDir: string;
  let repoPath: string;
  let worktreePath: string;
  let runtimeRoot: string;
  let request: AgentCapabilityLaunchRequest;
  let capabilities: ClaudeCapabilityCatalogItem[];

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'infilux-gemini-capability-'));
    process.env.HOME = rootDir;
    repoPath = join(rootDir, 'repo');
    worktreePath = join(repoPath, 'worktrees', 'feature-a');
    runtimeRoot = join(rootDir, 'runtime');

    writeTextFile(
      join(rootDir, '.gemini', 'settings.json'),
      JSON.stringify(
        {
          security: {
            auth: {
              selectedType: 'login-with-google',
            },
          },
          general: {
            vimMode: true,
          },
        },
        null,
        2
      )
    );
    writeTextFile(join(rootDir, '.gemini', 'memory.md'), '# Global memory');
    writeTextFile(
      join(rootDir, '.codex', 'skills', 'user-skill', 'SKILL.md'),
      ['---', 'name: User Skill', 'description: User skill', '---', '', '# User Skill'].join('\n')
    );
    writeTextFile(
      join(worktreePath, '.agents', 'skills', 'worktree-skill', 'SKILL.md'),
      ['---', 'name: Worktree Skill', 'description: Worktree skill', '---'].join('\n')
    );

    capabilities = [
      {
        id: 'legacy-skill:user-skill',
        kind: 'legacy-skill',
        name: 'User Skill',
        description: 'User skill',
        sourceScope: 'user',
        sourcePath: join(rootDir, '.codex', 'skills', 'user-skill', 'SKILL.md'),
        isAvailable: true,
        isConfigurable: true,
      },
      {
        id: 'legacy-skill:worktree-skill',
        kind: 'legacy-skill',
        name: 'Worktree Skill',
        description: 'Worktree skill',
        sourceScope: 'worktree',
        sourcePath: join(worktreePath, '.agents', 'skills', 'worktree-skill', 'SKILL.md'),
        isAvailable: true,
        isConfigurable: true,
      },
      {
        id: 'command:help',
        kind: 'command',
        name: 'Help',
        description: 'Help command',
        sourceScope: 'system',
        isAvailable: true,
        isConfigurable: false,
      },
    ];

    request = {
      provider: 'gemini',
      agentId: 'gemini',
      agentCommand: 'gemini',
      repoPath,
      worktreePath,
      globalPolicy: null,
      projectPolicy: null,
      worktreePolicy: null,
      sessionPolicy: null,
      materializationMode: 'provider-native',
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalGeminiCliHome === undefined) {
      delete process.env.GEMINI_CLI_HOME;
    } else {
      process.env.GEMINI_CLI_HOME = originalGeminiCliHome;
    }
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('materializes a Gemini runtime home with merged settings, linked skills, and environment overrides', async () => {
    const resolveClaudePolicy = vi.fn().mockReturnValue(
      createResolvedPolicy({
        repoPath,
        worktreePath,
        allowedCapabilityIds: ['legacy-skill:user-skill'],
        blockedCapabilityIds: ['legacy-skill:worktree-skill', 'command:help'],
        allowedSharedMcpIds: ['repo-mcp'],
      })
    );
    const adapter = createGeminiCapabilityProviderAdapter({
      listClaudeCapabilityCatalog: vi.fn().mockResolvedValue({
        capabilities,
        sharedMcpServers: [{ id: 'repo-mcp' }],
        personalMcpServers: [],
        generatedAt: 1,
      }),
      resolveClaudePolicy,
      resolveGeminiCapabilityMcpConfigEntries: vi.fn().mockResolvedValue({
        sharedById: {
          'repo-mcp': {
            id: 'repo-mcp',
            config: {
              command: '/bin/echo',
              args: ['hello'],
            },
            sourceScope: 'project',
            sourcePath: join(repoPath, '.mcp.json'),
          },
        },
        personalById: {},
      }),
      now: () => 123,
      tempRootDir: runtimeRoot,
    });

    const result = await adapter.prepareLaunch(request, {
      cwd: worktreePath,
      kind: 'agent',
      initialCommand: 'gemini --prompt "ship it"',
    });
    expect(result).not.toBeNull();
    if (!result) {
      throw new Error('Expected Gemini launch result');
    }

    expect(result.launchResult).toMatchObject({
      provider: 'gemini',
      repoPath,
      worktreePath,
      hash: 'hash-1',
      policyHash: 'hash-1',
      appliedAt: 123,
      projected: {
        materializationMode: 'provider-native',
        applied: true,
      },
    });
    expect(result.launchResult.warnings).toEqual([]);
    expect(
      resolveClaudePolicy.mock.calls[0]?.[0].catalog.capabilities.map(
        (item: ClaudeCapabilityCatalogItem) => item.kind
      )
    ).toEqual(['legacy-skill', 'legacy-skill']);

    const runtimeHome = getGeminiRuntimeHome(result);
    expect(result.sessionOverrides?.env).toEqual({
      GEMINI_CLI_HOME: runtimeHome,
      INFILUX_MANAGED_GEMINI_RUNTIME_HOME: runtimeHome,
    });
    expect(existsSync(join(runtimeHome, '.infilux-managed-runtime-home-v1'))).toBe(true);
    expect(dirname(runtimeHome)).toBe(join(runtimeRoot, 'gemini'));
    expect(result.sessionOverrides?.metadata).toMatchObject({
      providerLaunchStrategy: 'gemini-runtime-home',
      geminiHomePath: runtimeHome,
      geminiLinkedSkillIds: ['legacy-skill:user-skill'],
      geminiMcpServerIds: ['repo-mcp'],
    });
    expect(
      (result.sessionOverrides?.metadata?.geminiDisabledSkillNames as string[] | undefined)?.sort()
    ).toEqual(['Worktree Skill', 'skill-creator'].sort());

    const settingsPath = join(runtimeHome, '.gemini', 'settings.json');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
    expect(settings).toMatchObject({
      security: {
        auth: {
          selectedType: 'login-with-google',
        },
      },
      general: {
        vimMode: true,
      },
      mcpServers: {
        'repo-mcp': {
          command: '/bin/echo',
          args: ['hello'],
        },
      },
      mcp: {
        allowed: ['repo-mcp'],
        excluded: [],
      },
      skills: {
        enabled: true,
      },
    });
    expect(((settings.skills as { disabled?: string[] }).disabled ?? []).sort()).toEqual(
      ['Worktree Skill', 'skill-creator'].sort()
    );

    const linkedSkillPath = join(runtimeHome, '.gemini', 'skills', 'user-skill');
    expect(lstatSync(linkedSkillPath).isSymbolicLink()).toBe(true);
    expect(realpathSync(linkedSkillPath)).toBe(
      realpathSync(join(rootDir, '.codex', 'skills', 'user-skill'))
    );

    const linkedMemoryPath = join(runtimeHome, '.gemini', 'memory.md');
    expect(lstatSync(linkedMemoryPath).isSymbolicLink()).toBe(true);
    expect(realpathSync(linkedMemoryPath)).toBe(
      realpathSync(join(rootDir, '.gemini', 'memory.md'))
    );
  });

  it('reuses an unchanged Gemini runtime without rebuilding its skills directory', async () => {
    const adapter = createGeminiCapabilityProviderAdapter({
      listClaudeCapabilityCatalog: vi.fn().mockResolvedValue({
        capabilities,
        sharedMcpServers: [],
        personalMcpServers: [],
        generatedAt: 1,
      }),
      resolveClaudePolicy: vi.fn().mockReturnValue(
        createResolvedPolicy({
          repoPath,
          worktreePath,
          allowedCapabilityIds: ['legacy-skill:user-skill'],
        })
      ),
      resolveGeminiCapabilityMcpConfigEntries: vi.fn().mockResolvedValue({
        sharedById: {},
        personalById: {},
      }),
      tempRootDir: runtimeRoot,
    });
    const sessionOptions = {
      cwd: worktreePath,
      kind: 'agent' as const,
      initialCommand: 'gemini',
    };

    const first = await adapter.prepareLaunch(request, sessionOptions);
    const removeSpy = vi.spyOn(fs.promises, 'rm');
    const second = await adapter.prepareLaunch(request, sessionOptions);

    expect(first?.sessionOverrides?.env?.GEMINI_CLI_HOME).toBeDefined();
    expect(second?.sessionOverrides?.env?.GEMINI_CLI_HOME).toBe(
      first?.sessionOverrides?.env?.GEMINI_CLI_HOME
    );
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it('isolates Gemini runtime homes for worktrees with the same policy hash', async () => {
    const secondWorktreePath = join(repoPath, 'worktrees', 'feature-b');
    const adapter = createGeminiCapabilityProviderAdapter({
      listClaudeCapabilityCatalog: vi.fn().mockResolvedValue({
        capabilities: [capabilities[0]],
        sharedMcpServers: [],
        personalMcpServers: [],
        generatedAt: 1,
      }),
      resolveClaudePolicy: vi.fn((input: { repoPath: string; worktreePath: string }) =>
        createResolvedPolicy({
          repoPath: input.repoPath,
          worktreePath: input.worktreePath,
          allowedCapabilityIds: ['legacy-skill:user-skill'],
          hash: 'shared-policy',
          policyHash: 'shared-policy',
        })
      ),
      resolveGeminiCapabilityMcpConfigEntries: vi.fn().mockResolvedValue({
        sharedById: {},
        personalById: {},
      }),
      tempRootDir: runtimeRoot,
    });

    const first = await adapter.prepareLaunch(request, {
      cwd: worktreePath,
      kind: 'agent',
      initialCommand: 'gemini',
    });
    const second = await adapter.prepareLaunch(
      { ...request, worktreePath: secondWorktreePath },
      {
        cwd: secondWorktreePath,
        kind: 'agent',
        initialCommand: 'gemini',
      }
    );

    expect(first?.sessionOverrides?.env?.GEMINI_CLI_HOME).not.toBe(
      second?.sessionOverrides?.env?.GEMINI_CLI_HOME
    );
  });

  it('reuses an unchanged remote Gemini runtime without copying skills again', async () => {
    const remoteRepoPath = toRemoteVirtualPath('connection-1', '/srv/repo');
    const remoteWorktreePath = toRemoteVirtualPath('connection-1', '/srv/repo/worktrees/feature-a');
    const remoteSkillPath = '/home/tester/.codex/skills/user-skill/SKILL.md';
    const remoteFiles = new Map<string, string>([
      ['/home/tester/.gemini/settings.json', JSON.stringify({ general: { vimMode: true } })],
      [remoteSkillPath, ['---', 'name: User Skill', '---'].join('\n')],
    ]);
    const remoteDirectories = new Set<string>();
    const remoteCall = vi.mocked(remoteConnectionManager.call);
    remoteCall.mockImplementation(async (_connectionId, channel, payload) => {
      const request = payload as { path?: string; sourcePath?: string; targetPath?: string };
      if (channel === 'fs:exists') {
        return Boolean(
          (request.path && remoteFiles.has(request.path)) ||
            (request.path && remoteDirectories.has(request.path))
        );
      }
      if (channel === 'fs:createDirectory' && request.path) {
        remoteDirectories.add(request.path);
        return undefined;
      }
      if (channel === 'fs:copy' && request.targetPath) {
        remoteDirectories.add(request.targetPath);
        return undefined;
      }
      if (channel === 'fs:write' && request.path) {
        remoteFiles.set(request.path, String((payload as { content?: unknown }).content ?? ''));
        return undefined;
      }
      if (channel === 'fs:delete' && request.path) {
        remoteDirectories.delete(request.path);
        remoteFiles.delete(request.path);
        return undefined;
      }
      throw new Error(`Unexpected remote call: ${channel}`);
    });

    const remoteCapabilities: ClaudeCapabilityCatalogItem[] = [
      {
        id: 'legacy-skill:user-skill',
        kind: 'legacy-skill',
        name: 'User Skill',
        sourceScope: 'remote',
        sourcePath: remoteSkillPath,
        isAvailable: true,
        isConfigurable: true,
      },
    ];
    const adapter = createGeminiCapabilityProviderAdapter({
      listClaudeCapabilityCatalog: vi.fn().mockResolvedValue({
        capabilities: remoteCapabilities,
        sharedMcpServers: [],
        personalMcpServers: [],
        generatedAt: 1,
      }),
      resolveClaudePolicy: vi.fn().mockReturnValue(
        createResolvedPolicy({
          repoPath: remoteRepoPath,
          worktreePath: remoteWorktreePath,
          allowedCapabilityIds: ['legacy-skill:user-skill'],
        })
      ),
      resolveGeminiCapabilityMcpConfigEntries: vi.fn().mockResolvedValue({
        sharedById: {},
        personalById: {},
      }),
      getRepositoryEnvironmentContext: vi.fn().mockResolvedValue({
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
      readRepositoryRemoteTextFile: vi.fn(
        async (_repoPath, targetPath) => remoteFiles.get(targetPath) ?? null
      ),
    });
    const remoteRequest = {
      ...request,
      repoPath: remoteRepoPath,
      worktreePath: remoteWorktreePath,
    };
    const sessionOptions = {
      cwd: remoteWorktreePath,
      kind: 'agent' as const,
      initialCommand: 'gemini',
    };

    const first = await adapter.prepareLaunch(remoteRequest, sessionOptions);
    remoteCall.mockClear();
    const second = await adapter.prepareLaunch(remoteRequest, sessionOptions);

    expect(second?.sessionOverrides?.env?.GEMINI_CLI_HOME).toBe(
      first?.sessionOverrides?.env?.GEMINI_CLI_HOME
    );
    expect(remoteCall).not.toHaveBeenCalledWith('connection-1', 'fs:copy', expect.anything());
    expect(remoteCall).not.toHaveBeenCalledWith('connection-1', 'fs:delete', expect.anything());
  });

  it('uses the scoped Gemini home as the source for new Infilux sessions', async () => {
    const scopedGeminiHome = join(rootDir, 'infilux-provider-config', 'gemini');
    writeTextFile(
      join(scopedGeminiHome, 'settings.json'),
      JSON.stringify({ general: { vimMode: false, source: 'infilux' } })
    );
    process.env.GEMINI_CLI_HOME = scopedGeminiHome;
    const adapter = createGeminiCapabilityProviderAdapter({
      listClaudeCapabilityCatalog: vi.fn().mockResolvedValue({
        capabilities,
        sharedMcpServers: [],
        personalMcpServers: [],
        generatedAt: 1,
      }),
      resolveClaudePolicy: vi
        .fn()
        .mockReturnValue(createResolvedPolicy({ repoPath, worktreePath })),
      resolveGeminiCapabilityMcpConfigEntries: vi.fn().mockResolvedValue({
        personalById: {},
        sharedById: {},
      }),
      tempRootDir: runtimeRoot,
    });

    const result = await adapter.prepareLaunch(request, {
      cwd: worktreePath,
      initialCommand: 'gemini',
      kind: 'agent',
    });

    const runtimeSettings = JSON.parse(
      readFileSync(join(getGeminiRuntimeHome(result), '.gemini', 'settings.json'), 'utf8')
    ) as { general?: { source?: string; vimMode?: boolean } };
    expect(runtimeSettings.general).toMatchObject({ source: 'infilux', vimMode: false });
  });

  it('falls back to local copies when runtime symlink creation is unavailable', async () => {
    const symlinkSpy = vi
      .spyOn(fs.promises, 'symlink')
      .mockRejectedValue(Object.assign(new Error('symlink unavailable'), { code: 'EPERM' }));
    const resolveClaudePolicy = vi.fn().mockReturnValue(
      createResolvedPolicy({
        repoPath,
        worktreePath,
        allowedCapabilityIds: ['legacy-skill:user-skill'],
      })
    );
    const adapter = createGeminiCapabilityProviderAdapter({
      listClaudeCapabilityCatalog: vi.fn().mockResolvedValue({
        capabilities,
        sharedMcpServers: [],
        personalMcpServers: [],
        generatedAt: 1,
      }),
      resolveClaudePolicy,
      resolveGeminiCapabilityMcpConfigEntries: vi.fn().mockResolvedValue({
        sharedById: {},
        personalById: {},
      }),
      tempRootDir: runtimeRoot,
    });

    const result = await adapter.prepareLaunch(request, {
      cwd: worktreePath,
      kind: 'agent',
      initialCommand: 'gemini',
    });

    expect(result).not.toBeNull();
    if (!result?.launchResult.projected) {
      throw new Error('Expected Gemini launch projection');
    }
    expect(result.launchResult.projected.applied).toBe(true);
    expect(result.launchResult.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Gemini runtime symlink failed'),
        expect.stringContaining('Falling back to copy.'),
      ])
    );
    expect(symlinkSpy).toHaveBeenCalled();

    const runtimeHome = getGeminiRuntimeHome(result);
    const copiedSkillPath = join(runtimeHome, '.gemini', 'skills', 'user-skill');
    expect(lstatSync(copiedSkillPath).isSymbolicLink()).toBe(false);
    expect(readFileSync(join(copiedSkillPath, 'SKILL.md'), 'utf8')).toContain('User Skill');

    const copiedMemoryPath = join(runtimeHome, '.gemini', 'memory.md');
    expect(lstatSync(copiedMemoryPath).isSymbolicLink()).toBe(false);
    expect(readFileSync(copiedMemoryPath, 'utf8')).toBe('# Global memory');
  });

  it('returns unapplied launch metadata when Gemini runtime projection fails', async () => {
    writeTextFile(join(runtimeRoot, 'gemini'), 'not a directory');
    const adapter = createGeminiCapabilityProviderAdapter({
      listClaudeCapabilityCatalog: vi.fn().mockResolvedValue({
        capabilities,
        sharedMcpServers: [],
        personalMcpServers: [],
        generatedAt: 1,
      }),
      resolveClaudePolicy: vi.fn().mockReturnValue(
        createResolvedPolicy({
          repoPath,
          worktreePath,
          allowedCapabilityIds: ['legacy-skill:user-skill'],
        })
      ),
      resolveGeminiCapabilityMcpConfigEntries: vi.fn().mockResolvedValue({
        sharedById: {},
        personalById: {},
      }),
      tempRootDir: runtimeRoot,
    });

    const result = await adapter.prepareLaunch(request, {
      cwd: worktreePath,
      kind: 'agent',
      initialCommand: 'gemini',
    });

    expect(result).not.toBeNull();
    if (!result?.launchResult.projected) {
      throw new Error('Expected Gemini launch projection');
    }
    expect(result.sessionOverrides).toBeUndefined();
    expect(result.launchResult.projected.applied).toBe(false);
    expect(result.launchResult.projected.errors).toEqual([]);
    expect(result.launchResult.warnings).toEqual([
      expect.stringContaining(
        'Gemini runtime capability injection failed. The session was launched without Gemini-specific runtime overrides.'
      ),
    ]);
  });

  it('prefers the Gemini skill root when duplicate skill definitions exist in the same scope', async () => {
    writeTextFile(
      join(worktreePath, '.claude', 'skills', 'duplicate-skill', 'SKILL.md'),
      ['---', 'name: Claude Duplicate Skill', 'description: Claude duplicate skill', '---'].join(
        '\n'
      )
    );
    writeTextFile(
      join(worktreePath, '.gemini', 'skills', 'duplicate-skill', 'SKILL.md'),
      ['---', 'name: Gemini Duplicate Skill', 'description: Gemini duplicate skill', '---'].join(
        '\n'
      )
    );

    const adapter = createGeminiCapabilityProviderAdapter({
      listClaudeCapabilityCatalog: vi.fn().mockResolvedValue({
        capabilities: [
          {
            id: 'legacy-skill:duplicate-skill',
            kind: 'legacy-skill',
            name: 'Duplicate Skill',
            description: 'Duplicate skill',
            sourceScope: 'worktree',
            sourcePath: join(worktreePath, '.claude', 'skills', 'duplicate-skill', 'SKILL.md'),
            sourcePaths: [
              join(worktreePath, '.claude', 'skills', 'duplicate-skill', 'SKILL.md'),
              join(worktreePath, '.gemini', 'skills', 'duplicate-skill', 'SKILL.md'),
            ],
            isAvailable: true,
            isConfigurable: true,
          },
        ],
        sharedMcpServers: [],
        personalMcpServers: [],
        generatedAt: 1,
      }),
      resolveClaudePolicy: vi.fn().mockReturnValue(
        createResolvedPolicy({
          repoPath,
          worktreePath,
          blockedCapabilityIds: ['legacy-skill:duplicate-skill'],
        })
      ),
      resolveGeminiCapabilityMcpConfigEntries: vi.fn().mockResolvedValue({
        sharedById: {},
        personalById: {},
      }),
      now: () => 456,
      tempRootDir: runtimeRoot,
    });

    const result = await adapter.prepareLaunch(request, {
      cwd: worktreePath,
      kind: 'agent',
      initialCommand: 'gemini',
    });
    expect(result).not.toBeNull();
    if (!result) {
      throw new Error('Expected Gemini launch result');
    }

    const runtimeHome = getGeminiRuntimeHome(result);
    const settingsPath = join(runtimeHome, '.gemini', 'settings.json');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
      skills?: { disabled?: string[] };
    };
    expect(settings.skills?.disabled).toEqual(
      expect.arrayContaining(['Gemini Duplicate Skill', 'skill-creator'])
    );
    expect(settings.skills?.disabled).not.toEqual(
      expect.arrayContaining(['Claude Duplicate Skill'])
    );
  });
});
