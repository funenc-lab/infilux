import type { AgentCapabilityLaunchRequest, SessionCreateOptions } from '@shared/types';
import { describe, expect, it, vi } from 'vitest';
import {
  prepareAgentCapabilityLaunch,
  resolveAgentCapabilityLaunchRequest,
} from '../AgentCapabilityLaunchService';

function createMetadata(agentBaseId = 'claude') {
  return {
    agentId: agentBaseId,
    agentCommand: agentBaseId,
    repoPath: '/repo',
    worktreePath: '/repo/worktrees/feat-a',
    globalPolicy: null,
    projectPolicy: null,
    worktreePolicy: null,
    sessionPolicy: null,
    materializationMode: 'copy' as const,
  };
}

function createSessionOptions(): SessionCreateOptions {
  return {
    cwd: '/repo/worktrees/feat-a',
    kind: 'agent',
    shell: 'codex',
    args: ['resume', 'codex-session-1'],
  };
}

function createPolicy(overrides: Record<string, unknown> = {}) {
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

describe('AgentCapabilityLaunchService', () => {
  it('parses generic launch metadata first', () => {
    expect(
      resolveAgentCapabilityLaunchRequest({
        agentCapabilityLaunch: {
          provider: 'codex',
          ...createMetadata('codex'),
        },
        claudePolicyLaunch: {
          ...createMetadata(),
          materializationMode: 'symlink',
        },
      })
    ).toEqual({
      provider: 'codex',
      ...createMetadata('codex'),
    });
  });

  it('falls back to legacy Claude launch metadata', () => {
    expect(
      resolveAgentCapabilityLaunchRequest({
        claudePolicyLaunch: createMetadata(),
      })
    ).toEqual({
      provider: 'claude',
      ...createMetadata(),
    });
  });

  it('normalizes provider-specific policies and materialization modes from launch metadata', () => {
    expect(
      resolveAgentCapabilityLaunchRequest({
        agentCapabilityLaunch: {
          provider: 'gemini',
          agentId: 42,
          agentCommand: null,
          repoPath: '/repo',
          worktreePath: '/repo/worktrees/feat-a',
          globalPolicy: createPolicy(),
          projectPolicy: createPolicy({ repoPath: '/repo' }),
          worktreePolicy: createPolicy({
            repoPath: '/repo',
            worktreePath: '/repo/worktrees/feat-a',
          }),
          sessionPolicy: createPolicy(),
          materializationMode: 'provider-native',
        },
      })
    ).toEqual({
      provider: 'gemini',
      repoPath: '/repo',
      worktreePath: '/repo/worktrees/feat-a',
      globalPolicy: createPolicy(),
      projectPolicy: createPolicy({ repoPath: '/repo' }),
      worktreePolicy: createPolicy({
        repoPath: '/repo',
        worktreePath: '/repo/worktrees/feat-a',
      }),
      sessionPolicy: createPolicy(),
      materializationMode: 'provider-native',
    });

    expect(
      resolveAgentCapabilityLaunchRequest({
        agentCapabilityLaunch: {
          provider: 'claude',
          ...createMetadata(),
          materializationMode: 'symlink',
        },
      })?.materializationMode
    ).toBe('symlink');
  });

  it('drops malformed launch metadata and invalid nested policy records', () => {
    expect(resolveAgentCapabilityLaunchRequest(undefined)).toBeNull();
    expect(
      resolveAgentCapabilityLaunchRequest({
        agentCapabilityLaunch: [],
        claudePolicyLaunch: null,
      })
    ).toBeNull();
    expect(
      resolveAgentCapabilityLaunchRequest({
        agentCapabilityLaunch: {
          provider: 'unknown',
          ...createMetadata(),
        },
      })
    ).toBeNull();
    expect(
      resolveAgentCapabilityLaunchRequest({
        agentCapabilityLaunch: {
          provider: 'codex',
          repoPath: '/repo',
        },
      })
    ).toBeNull();

    expect(
      resolveAgentCapabilityLaunchRequest({
        agentCapabilityLaunch: {
          provider: 'codex',
          ...createMetadata('codex'),
          globalPolicy: createPolicy({ allowedCapabilityIds: 'bad' }),
          projectPolicy: createPolicy({ repoPath: 10 }),
          worktreePolicy: createPolicy({ repoPath: '/repo', worktreePath: false }),
          sessionPolicy: createPolicy({ updatedAt: 'bad' }),
          materializationMode: 'invalid',
        },
      })
    ).toEqual({
      provider: 'codex',
      ...createMetadata('codex'),
      globalPolicy: null,
      projectPolicy: null,
      worktreePolicy: null,
      sessionPolicy: null,
      materializationMode: undefined,
    });
  });

  it('dispatches Claude launch preparation through the Claude adapter', async () => {
    const prepareLaunch = vi.fn().mockResolvedValue({
      launchResult: {
        provider: 'claude',
        repoPath: '/repo',
        worktreePath: '/repo/worktrees/feat-a',
        hash: 'hash-1',
        warnings: [],
        resolvedPolicy: {
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
        },
        projected: {
          hash: 'hash-1',
          materializationMode: 'copy',
          applied: true,
          updatedFiles: [],
          warnings: [],
          errors: [],
        },
        policyHash: 'hash-1',
        appliedAt: 1,
      },
      sessionOverrides: {
        env: {
          AGENT_CAPABILITY_PROFILE: 'strict',
        },
      },
    });
    const request: AgentCapabilityLaunchRequest = {
      provider: 'claude',
      ...createMetadata(),
    };

    await expect(
      prepareAgentCapabilityLaunch(
        request,
        {
          cwd: '/repo/worktrees/feat-a',
          kind: 'agent',
          shell: 'claude',
        },
        {
          resolveAdapter: () => ({
            provider: 'claude',
            prepareLaunch,
          }),
        }
      )
    ).resolves.toMatchObject({
      launchResult: {
        provider: 'claude',
        hash: 'hash-1',
      },
      sessionOverrides: {
        env: {
          AGENT_CAPABILITY_PROFILE: 'strict',
        },
      },
    });

    expect(prepareLaunch).toHaveBeenCalledWith(
      {
        ...request,
      },
      {
        cwd: '/repo/worktrees/feat-a',
        kind: 'agent',
        shell: 'claude',
      }
    );
  });

  it('passes the original session options through to the provider adapter', async () => {
    const prepareLaunch = vi.fn().mockResolvedValue({
      launchResult: {
        provider: 'codex',
        repoPath: '/repo',
        worktreePath: '/repo/worktrees/feat-a',
        hash: 'hash-2',
        warnings: [],
      },
    });

    await expect(
      prepareAgentCapabilityLaunch(
        {
          provider: 'codex',
          ...createMetadata('codex'),
        },
        createSessionOptions(),
        {
          resolveAdapter: () => ({
            provider: 'codex',
            prepareLaunch,
          }),
        }
      )
    ).resolves.toMatchObject({
      launchResult: {
        provider: 'codex',
        hash: 'hash-2',
      },
    });

    expect(prepareLaunch).toHaveBeenCalledWith(
      {
        provider: 'codex',
        ...createMetadata('codex'),
      },
      createSessionOptions()
    );
  });

  it('returns null when no provider adapter is registered', async () => {
    await expect(
      prepareAgentCapabilityLaunch(
        {
          provider: 'codex',
          ...createMetadata('codex'),
        },
        createSessionOptions(),
        {
          resolveAdapter: () => null,
        }
      )
    ).resolves.toBeNull();
  });
});
