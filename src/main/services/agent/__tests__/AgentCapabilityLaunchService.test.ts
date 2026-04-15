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
