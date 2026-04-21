import type { ResolvedClaudePolicy, SessionCreateOptions } from '@shared/types';
import { describe, expect, it } from 'vitest';
import type { CapabilityMcpConfigSet } from '../CapabilityMcpConfigService';
import { buildClaudeNativeMcpSessionOverrides } from '../ClaudeNativeMcpSessionOverrides';

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
    personalById: {
      'personal-beta': {
        id: 'personal-beta',
        config: {
          type: 'http',
          url: 'https://example.com/mcp',
          headers: {
            Authorization: 'Bearer token',
          },
        },
        sourceScope: 'worktree',
        sourcePath: '/Users/test/.claude.json',
      },
    },
  };
}

describe('ClaudeNativeMcpSessionOverrides', () => {
  it('injects strict MCP config into direct Claude launches', () => {
    const result = buildClaudeNativeMcpSessionOverrides(
      {
        cwd: '/repo/worktrees/feat-a',
        kind: 'agent',
        shell: 'claude',
        args: ['--resume', 'session-1'],
      },
      createResolvedPolicy({
        allowedSharedMcpIds: ['shared-alpha'],
        allowedPersonalMcpIds: ['personal-beta'],
      }),
      createMcpConfigs()
    );

    expect(result.applied).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.sessionOverrides?.args).toEqual([
      '--mcp-config',
      '{"mcpServers":{"personal-beta":{"headers":{"Authorization":"Bearer token"},"type":"http","url":"https://example.com/mcp"},"shared-alpha":{"args":["shared-alpha"],"command":"/bin/echo"}}}',
      '--strict-mcp-config',
      '--resume',
      'session-1',
    ]);
    expect(result.sessionOverrides?.metadata).toEqual({
      providerLaunchStrategy: 'claude-native-mcp-config',
      claudeMcpServerIds: ['personal-beta', 'shared-alpha'],
      claudeNativeMcpStrict: true,
    });
  });

  it('returns a warning when the current launch shape does not expose a Claude command to patch', () => {
    const sessionOptions: SessionCreateOptions = {
      cwd: '/repo/worktrees/feat-a',
      kind: 'agent',
      shell: '/bin/zsh',
      args: ['-lc', 'python app.py'],
      shellConfig: {
        shellType: 'zsh',
      },
    };

    const result = buildClaudeNativeMcpSessionOverrides(
      sessionOptions,
      createResolvedPolicy({
        allowedSharedMcpIds: ['shared-alpha'],
      }),
      createMcpConfigs()
    );

    expect(result.applied).toBe(false);
    expect(result.sessionOverrides).toBeUndefined();
    expect(result.warnings).toEqual([
      'Claude native MCP injection could not match the current session launch shape. Falling back to workspace MCP projection for this session.',
    ]);
  });
});
