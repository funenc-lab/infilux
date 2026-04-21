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

  it('adds native MCP session overrides and skips workspace MCP projection when the launch shape is patchable', async () => {
    const listClaudeCapabilityCatalog = vi.fn().mockResolvedValue({
      capabilities: [],
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
      personalMcpServers: [],
      generatedAt: 1,
    });
    const resolveClaudePolicy = vi.fn().mockReturnValue({
      repoPath: '/repo',
      worktreePath: '/repo/worktrees/feat-a',
      allowedCapabilityIds: [],
      blockedCapabilityIds: [],
      allowedSharedMcpIds: ['shared-alpha'],
      blockedSharedMcpIds: [],
      allowedPersonalMcpIds: [],
      blockedPersonalMcpIds: [],
      capabilityProvenance: {},
      sharedMcpProvenance: {},
      personalMcpProvenance: {},
      hash: 'hash-1',
      policyHash: 'hash-1',
    });
    const resolveCapabilityMcpConfigEntries = vi.fn().mockResolvedValue({
      sharedById: {
        'shared-alpha': {
          id: 'shared-alpha',
          config: {
            command: '/bin/echo',
            args: ['shared-alpha'],
          },
          sourceScope: 'project',
          sourcePath: '/repo/.mcp.json',
        },
      },
      personalById: {},
    });
    const projectClaudeRuntimePolicy = vi.fn().mockResolvedValue({
      hash: 'hash-1',
      materializationMode: 'copy',
      applied: true,
      updatedFiles: [],
      warnings: [],
      errors: [],
    });
    const adapter = createClaudeCapabilityProviderAdapter({
      listClaudeCapabilityCatalog,
      resolveClaudePolicy,
      resolveCapabilityMcpConfigEntries,
      projectClaudeRuntimePolicy,
    });

    const result = await adapter.prepareLaunch(createRequest(), {
      cwd: '/repo/worktrees/feat-a',
      kind: 'agent',
      shell: 'claude',
      args: ['--resume', 'session-1'],
    });

    expect(result).not.toBeNull();
    if (!result) {
      throw new Error('Expected Claude capability launch preparation result.');
    }

    expect(result.sessionOverrides?.args).toEqual([
      '--mcp-config',
      '{"mcpServers":{"shared-alpha":{"args":["shared-alpha"],"command":"/bin/echo"}}}',
      '--strict-mcp-config',
      '--resume',
      'session-1',
    ]);
    expect(projectClaudeRuntimePolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        repoPath: '/repo',
        worktreePath: '/repo/worktrees/feat-a',
        projectWorkspaceMcp: false,
      })
    );
  });
});
