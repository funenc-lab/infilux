import {
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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGeminiCapabilityProviderAdapter } from '../GeminiCapabilityProviderAdapter';

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

describe('GeminiCapabilityProviderAdapter', () => {
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

    const runtimeHome = join(runtimeRoot, 'gemini', 'hash-1');
    expect(result.sessionOverrides?.env).toEqual({
      GEMINI_CLI_HOME: runtimeHome,
    });
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

    const runtimeHome = join(runtimeRoot, 'gemini', 'hash-1');
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
