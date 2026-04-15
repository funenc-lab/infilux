import type { AgentCapabilityLaunchRequest, SessionCreateOptions } from '@shared/types';
import { describe, expect, it, vi } from 'vitest';
import { createClaudeCapabilityProviderAdapter } from '../ClaudeCapabilityProviderAdapter';

function createRequest(): AgentCapabilityLaunchRequest {
  return {
    provider: 'claude',
    agentId: 'claude',
    agentCommand: 'claude',
    repoPath: '/repo',
    worktreePath: '/repo/worktrees/feat-a',
    globalPolicy: null,
    projectPolicy: null,
    worktreePolicy: null,
    sessionPolicy: null,
    materializationMode: 'copy',
  };
}

function createSessionOptions(): SessionCreateOptions {
  return {
    cwd: '/repo/worktrees/feat-a',
    kind: 'agent',
    shell: 'claude',
  };
}

describe('ClaudeCapabilityProviderAdapter', () => {
  it('wraps Claude launch preparation into the generic adapter result shape', async () => {
    const prepareClaudeAgentLaunch = vi.fn().mockResolvedValue({
      repoPath: '/repo',
      worktreePath: '/repo/worktrees/feat-a',
      hash: 'hash-1',
      warnings: ['warn-1'],
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
        updatedFiles: ['/repo/worktrees/feat-a/.mcp.json'],
        warnings: ['warn-1'],
        errors: [],
      },
      policyHash: 'hash-1',
      appliedAt: 123,
    });
    const adapter = createClaudeCapabilityProviderAdapter({
      prepareClaudeAgentLaunch,
    });

    await expect(adapter.prepareLaunch(createRequest(), createSessionOptions())).resolves.toEqual({
      launchResult: {
        provider: 'claude',
        repoPath: '/repo',
        worktreePath: '/repo/worktrees/feat-a',
        hash: 'hash-1',
        warnings: ['warn-1'],
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
          updatedFiles: ['/repo/worktrees/feat-a/.mcp.json'],
          warnings: ['warn-1'],
          errors: [],
        },
        policyHash: 'hash-1',
        appliedAt: 123,
      },
    });

    expect(prepareClaudeAgentLaunch).toHaveBeenCalledWith({
      agentId: 'claude',
      agentCommand: 'claude',
      repoPath: '/repo',
      worktreePath: '/repo/worktrees/feat-a',
      globalPolicy: null,
      projectPolicy: null,
      worktreePolicy: null,
      sessionPolicy: null,
      materializationMode: 'copy',
    });
  });
});
