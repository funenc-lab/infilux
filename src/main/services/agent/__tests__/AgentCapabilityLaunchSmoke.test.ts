import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type {
  AgentCapabilityProvider,
  ClaudePolicyConfig,
  SessionCreateOptions,
} from '@shared/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  prepareAgentCapabilityLaunch,
  resolveAgentCapabilityLaunchRequest,
} from '../AgentCapabilityLaunchService';

function writeTextFile(targetPath: string, content: string): void {
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, content, 'utf8');
}

function createPolicy(overrides: Partial<ClaudePolicyConfig> = {}): ClaudePolicyConfig {
  return {
    allowedCapabilityIds: [],
    blockedCapabilityIds: [],
    allowedSharedMcpIds: [],
    blockedSharedMcpIds: [],
    allowedPersonalMcpIds: [],
    blockedPersonalMcpIds: [],
    updatedAt: 1,
    ...overrides,
  };
}

function createLaunchMetadata(params: {
  provider: AgentCapabilityProvider;
  repoPath: string;
  worktreePath: string;
  sessionPolicy: ClaudePolicyConfig;
}): Record<string, unknown> {
  return {
    agentCapabilityLaunch: {
      provider: params.provider,
      agentId: params.provider,
      agentCommand: params.provider,
      repoPath: params.repoPath,
      worktreePath: params.worktreePath,
      globalPolicy: null,
      projectPolicy: null,
      worktreePolicy: null,
      sessionPolicy: params.sessionPolicy,
      materializationMode: 'provider-native',
    },
  };
}

describe('AgentCapabilityLaunchService smoke tests', () => {
  const originalHome = process.env.HOME;
  let rootDir: string;
  let repoPath: string;
  let worktreePath: string;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'infilux-agent-capability-smoke-'));
    process.env.HOME = rootDir;
    repoPath = join(rootDir, 'repo');
    worktreePath = join(repoPath, 'worktrees', 'feature-a');

    writeTextFile(
      join(repoPath, '.codex', 'skills', 'ship', 'SKILL.md'),
      ['---', 'name: Ship', 'description: Ship the release', '---', '', '# Ship'].join('\n')
    );
    writeTextFile(
      join(worktreePath, '.codex', 'skills', 'review', 'SKILL.md'),
      ['---', 'name: Review', 'description: Review the change', '---', '', '# Review'].join('\n')
    );
    writeTextFile(
      join(worktreePath, '.gemini', 'skills', 'review', 'SKILL.md'),
      ['---', 'name: Review', 'description: Review the change', '---', '', '# Review'].join('\n')
    );
    writeTextFile(
      join(repoPath, '.mcp.json'),
      JSON.stringify(
        {
          mcpServers: {
            'repo-mcp': {
              command: '/bin/echo',
              args: ['repo'],
              env: {
                SCOPE: 'repo',
              },
            },
          },
        },
        null,
        2
      )
    );
    writeTextFile(
      join(rootDir, '.gemini', 'settings.json'),
      JSON.stringify(
        {
          general: {
            vimMode: true,
          },
        },
        null,
        2
      )
    );
  });

  afterEach(() => {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('resolves Codex launch metadata into provider-native CLI overrides and projection metadata', async () => {
    const metadata = createLaunchMetadata({
      provider: 'codex',
      repoPath,
      worktreePath,
      sessionPolicy: createPolicy({
        allowedCapabilityIds: ['legacy-skill:ship'],
        blockedCapabilityIds: ['legacy-skill:review'],
        allowedSharedMcpIds: ['repo-mcp'],
      }),
    });
    const launchRequest = resolveAgentCapabilityLaunchRequest(metadata);
    expect(launchRequest).not.toBeNull();
    if (!launchRequest) {
      throw new Error('Expected Codex launch request');
    }

    const sessionOptions: SessionCreateOptions = {
      cwd: worktreePath,
      kind: 'agent',
      shell: 'codex',
      args: ['resume', 'codex-session-1'],
    };

    const preparedLaunch = await prepareAgentCapabilityLaunch(launchRequest, sessionOptions);
    expect(preparedLaunch).not.toBeNull();
    if (!preparedLaunch) {
      throw new Error('Expected Codex prepared launch');
    }

    expect(preparedLaunch.launchResult).toMatchObject({
      provider: 'codex',
      repoPath,
      worktreePath,
      policyHash: preparedLaunch.launchResult.hash,
      projected: {
        materializationMode: 'provider-native',
        applied: true,
      },
    });
    expect(preparedLaunch.launchResult.warnings).toEqual([]);
    expect(preparedLaunch.launchResult.resolvedPolicy?.allowedCapabilityIds).toEqual([
      'legacy-skill:ship',
    ]);
    expect(preparedLaunch.launchResult.resolvedPolicy?.blockedCapabilityIds).toEqual([
      'legacy-skill:review',
    ]);
    expect(preparedLaunch.sessionOverrides?.metadata).toMatchObject({
      providerLaunchStrategy: 'codex-runtime-config',
      codexMcpServerIds: ['repo-mcp'],
      codexSkillIds: ['legacy-skill:review', 'legacy-skill:ship'],
    });
    expect(preparedLaunch.sessionOverrides?.args).toEqual(
      expect.arrayContaining([
        '-c',
        'mcp_servers.repo-mcp.command="/bin/echo"',
        '-c',
        `skills.config=[{enabled = false, path = "${join(
          worktreePath,
          '.codex',
          'skills',
          'review',
          'SKILL.md'
        )}"}, {enabled = false, path = "${join(
          worktreePath,
          '.gemini',
          'skills',
          'review',
          'SKILL.md'
        )}"}, {enabled = true, path = "${join(
          repoPath,
          '.codex',
          'skills',
          'ship',
          'SKILL.md'
        )}"}]`,
        'resume',
        'codex-session-1',
      ])
    );
  });

  it('resolves Gemini launch metadata into an isolated runtime home and disabled skill settings', async () => {
    const metadata = createLaunchMetadata({
      provider: 'gemini',
      repoPath,
      worktreePath,
      sessionPolicy: createPolicy({
        allowedCapabilityIds: ['legacy-skill:ship'],
        blockedCapabilityIds: ['legacy-skill:review'],
        allowedSharedMcpIds: ['repo-mcp'],
      }),
    });
    const launchRequest = resolveAgentCapabilityLaunchRequest(metadata);
    expect(launchRequest).not.toBeNull();
    if (!launchRequest) {
      throw new Error('Expected Gemini launch request');
    }

    const preparedLaunch = await prepareAgentCapabilityLaunch(launchRequest, {
      cwd: worktreePath,
      kind: 'agent',
      initialCommand: 'gemini --prompt "ship"',
    });
    expect(preparedLaunch).not.toBeNull();
    if (!preparedLaunch) {
      throw new Error('Expected Gemini prepared launch');
    }

    expect(preparedLaunch.launchResult).toMatchObject({
      provider: 'gemini',
      repoPath,
      worktreePath,
      policyHash: preparedLaunch.launchResult.hash,
      projected: {
        materializationMode: 'provider-native',
        applied: true,
      },
    });
    expect(preparedLaunch.launchResult.warnings).toEqual([]);
    expect(preparedLaunch.launchResult.resolvedPolicy?.allowedCapabilityIds).toEqual([
      'legacy-skill:ship',
    ]);
    expect(preparedLaunch.launchResult.resolvedPolicy?.blockedCapabilityIds).toEqual([
      'legacy-skill:review',
    ]);

    const runtimeHome = preparedLaunch.sessionOverrides?.env?.GEMINI_CLI_HOME;
    expect(typeof runtimeHome).toBe('string');
    if (typeof runtimeHome !== 'string') {
      throw new Error('Expected Gemini runtime home');
    }

    expect(preparedLaunch.sessionOverrides?.metadata).toMatchObject({
      providerLaunchStrategy: 'gemini-runtime-home',
      geminiHomePath: runtimeHome,
      geminiLinkedSkillIds: ['legacy-skill:ship'],
      geminiMcpServerIds: ['repo-mcp'],
    });
    expect(preparedLaunch.sessionOverrides?.metadata?.geminiDisabledSkillNames).toEqual(
      expect.arrayContaining(['Review', 'skill-creator'])
    );

    const settings = JSON.parse(
      readFileSync(join(runtimeHome, '.gemini', 'settings.json'), 'utf8')
    ) as {
      mcpServers?: Record<string, unknown>;
      mcp?: { allowed?: string[]; excluded?: string[] };
      skills?: { enabled?: boolean; disabled?: string[] };
    };
    expect(settings).toMatchObject({
      general: {
        vimMode: true,
      },
      mcpServers: {
        'repo-mcp': {
          command: '/bin/echo',
          args: ['repo'],
          env: {
            SCOPE: 'repo',
          },
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
    expect(settings.skills?.disabled).toEqual(expect.arrayContaining(['Review', 'skill-creator']));
    expect(lstatSync(join(runtimeHome, '.gemini', 'skills', 'ship')).isSymbolicLink()).toBe(true);
  });
});
