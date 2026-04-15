import type {
  ClaudeCapabilityCatalog,
  ClaudeProjectPolicy,
  ClaudeWorktreePolicy,
} from '@shared/types';
import { describe, expect, it } from 'vitest';
import { resolveClaudePolicy } from '../ClaudePolicyResolver';

const baseCatalog: ClaudeCapabilityCatalog = {
  capabilities: [
    {
      id: 'command:build',
      kind: 'command',
      name: 'Build',
      sourceScope: 'project',
      isAvailable: true,
      isConfigurable: true,
    },
    {
      id: 'subagent:reviewer',
      kind: 'subagent',
      name: 'Reviewer',
      sourceScope: 'project',
      isAvailable: true,
      isConfigurable: true,
    },
    {
      id: 'legacy-skill:ship',
      kind: 'legacy-skill',
      name: 'Ship',
      sourceScope: 'project',
      isAvailable: true,
      isConfigurable: true,
    },
  ],
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
  personalMcpServers: [
    {
      id: 'personal-alpha',
      name: 'Personal Alpha',
      scope: 'personal',
      sourceScope: 'user',
      transportType: 'http',
      isAvailable: true,
      isConfigurable: true,
    },
  ],
  generatedAt: 1,
};

function createProjectPolicy(overrides: Partial<ClaudeProjectPolicy> = {}): ClaudeProjectPolicy {
  return {
    repoPath: '/repo',
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

function createWorktreePolicy(overrides: Partial<ClaudeWorktreePolicy> = {}): ClaudeWorktreePolicy {
  return {
    repoPath: '/repo',
    worktreePath: '/repo/worktrees/feature-a',
    allowedCapabilityIds: [],
    blockedCapabilityIds: [],
    allowedSharedMcpIds: [],
    blockedSharedMcpIds: [],
    allowedPersonalMcpIds: [],
    blockedPersonalMcpIds: [],
    updatedAt: 2,
    ...overrides,
  };
}

describe('resolveClaudePolicy', () => {
  it('applies global allow-only policy before project and worktree overrides', () => {
    const resolved = resolveClaudePolicy({
      catalog: baseCatalog,
      repoPath: '/repo',
      worktreePath: '/repo/worktrees/feature-a',
      globalPolicy: {
        allowedCapabilityIds: ['command:build'],
        blockedCapabilityIds: [],
        allowedSharedMcpIds: ['shared-alpha'],
        blockedSharedMcpIds: [],
        allowedPersonalMcpIds: [],
        blockedPersonalMcpIds: ['personal-alpha'],
        updatedAt: 1,
      },
      projectPolicy: null,
      worktreePolicy: null,
    } as Parameters<typeof resolveClaudePolicy>[0]);

    expect(resolved.allowedCapabilityIds).toEqual(['command:build']);
    expect(resolved.allowedSharedMcpIds).toEqual(['shared-alpha']);
    expect(resolved.allowedPersonalMcpIds).toEqual([]);
    expect(resolved.blockedPersonalMcpIds).toEqual(['personal-alpha']);
    expect(resolved.capabilityProvenance['command:build']).toEqual({
      source: 'global-policy',
      decision: 'allow',
    });
  });

  it('supports project allow-only resolution for capabilities and MCP', () => {
    const resolved = resolveClaudePolicy({
      catalog: baseCatalog,
      repoPath: '/repo',
      worktreePath: '/repo/worktrees/feature-a',
      projectPolicy: createProjectPolicy({
        allowedCapabilityIds: ['command:build'],
        allowedSharedMcpIds: ['shared-alpha'],
        allowedPersonalMcpIds: ['personal-alpha'],
      }),
      worktreePolicy: null,
    });

    expect(resolved.allowedCapabilityIds).toEqual(['command:build']);
    expect(resolved.allowedSharedMcpIds).toEqual(['shared-alpha']);
    expect(resolved.allowedPersonalMcpIds).toEqual(['personal-alpha']);
    expect(resolved.capabilityProvenance['command:build']).toEqual({
      source: 'project-policy',
      decision: 'allow',
    });
  });

  it('lets project block win over project allow', () => {
    const resolved = resolveClaudePolicy({
      catalog: baseCatalog,
      repoPath: '/repo',
      worktreePath: '/repo/worktrees/feature-a',
      projectPolicy: createProjectPolicy({
        allowedCapabilityIds: ['command:build'],
        blockedCapabilityIds: ['command:build'],
      }),
      worktreePolicy: null,
    });

    expect(resolved.allowedCapabilityIds).not.toContain('command:build');
    expect(resolved.blockedCapabilityIds).toContain('command:build');
    expect(resolved.capabilityProvenance['command:build']).toEqual({
      source: 'project-policy',
      decision: 'block',
    });
  });

  it('lets worktree block override project allow', () => {
    const resolved = resolveClaudePolicy({
      catalog: baseCatalog,
      repoPath: '/repo',
      worktreePath: '/repo/worktrees/feature-a',
      projectPolicy: createProjectPolicy({
        allowedCapabilityIds: ['subagent:reviewer'],
      }),
      worktreePolicy: createWorktreePolicy({
        blockedCapabilityIds: ['subagent:reviewer'],
      }),
    });

    expect(resolved.allowedCapabilityIds).not.toContain('subagent:reviewer');
    expect(resolved.blockedCapabilityIds).toContain('subagent:reviewer');
    expect(resolved.capabilityProvenance['subagent:reviewer']).toEqual({
      source: 'worktree-policy',
      decision: 'block',
    });
  });

  it('lets worktree allow restore items only when they are not blocked', () => {
    const resolved = resolveClaudePolicy({
      catalog: baseCatalog,
      repoPath: '/repo',
      worktreePath: '/repo/worktrees/feature-a',
      globalPolicy: {
        allowedCapabilityIds: ['command:build', 'subagent:reviewer'],
        blockedCapabilityIds: [],
        allowedSharedMcpIds: [],
        blockedSharedMcpIds: [],
        allowedPersonalMcpIds: [],
        blockedPersonalMcpIds: [],
        updatedAt: 1,
      },
      projectPolicy: createProjectPolicy({
        allowedCapabilityIds: ['command:build'],
        blockedCapabilityIds: ['legacy-skill:ship'],
      }),
      worktreePolicy: createWorktreePolicy({
        allowedCapabilityIds: ['subagent:reviewer', 'legacy-skill:ship'],
      }),
    } as Parameters<typeof resolveClaudePolicy>[0]);

    expect(resolved.allowedCapabilityIds).toEqual(['command:build', 'subagent:reviewer']);
    expect(resolved.allowedCapabilityIds).not.toContain('legacy-skill:ship');
    expect(resolved.blockedCapabilityIds).toContain('legacy-skill:ship');
    expect(resolved.capabilityProvenance['subagent:reviewer']).toEqual({
      source: 'worktree-policy',
      decision: 'allow',
    });
    expect(resolved.capabilityProvenance['legacy-skill:ship']).toEqual({
      source: 'project-policy',
      decision: 'block',
    });
  });

  it('produces a stable hash for identical effective results', () => {
    const first = resolveClaudePolicy({
      catalog: {
        ...baseCatalog,
        capabilities: [...baseCatalog.capabilities].reverse(),
      },
      repoPath: '/repo',
      worktreePath: '/repo/worktrees/feature-a',
      projectPolicy: createProjectPolicy({
        allowedCapabilityIds: ['subagent:reviewer', 'command:build'],
      }),
      worktreePolicy: createWorktreePolicy({
        blockedCapabilityIds: ['legacy-skill:ship'],
      }),
    });
    const second = resolveClaudePolicy({
      catalog: baseCatalog,
      repoPath: '/repo',
      worktreePath: '/repo/worktrees/feature-a',
      projectPolicy: createProjectPolicy({
        allowedCapabilityIds: ['command:build', 'subagent:reviewer'],
      }),
      worktreePolicy: createWorktreePolicy({
        blockedCapabilityIds: ['legacy-skill:ship'],
      }),
    });

    expect(first.hash).toBe(second.hash);
    expect(first.allowedCapabilityIds).toEqual(second.allowedCapabilityIds);
    expect(first.blockedCapabilityIds).toEqual(second.blockedCapabilityIds);
  });

  it('applies session-level overrides after worktree resolution and records session provenance', () => {
    const resolved = resolveClaudePolicy({
      catalog: baseCatalog,
      repoPath: '/repo',
      worktreePath: '/repo/worktrees/feature-a',
      projectPolicy: createProjectPolicy({
        allowedCapabilityIds: ['command:build'],
      }),
      worktreePolicy: createWorktreePolicy({
        blockedCapabilityIds: ['subagent:reviewer'],
      }),
      sessionPolicy: {
        allowedCapabilityIds: ['legacy-skill:ship'],
        blockedCapabilityIds: ['command:build'],
        allowedSharedMcpIds: ['shared-alpha'],
        blockedSharedMcpIds: [],
        allowedPersonalMcpIds: ['personal-alpha'],
        blockedPersonalMcpIds: [],
        updatedAt: 9,
      },
    });

    expect(resolved.allowedCapabilityIds).toEqual(['legacy-skill:ship']);
    expect(resolved.blockedCapabilityIds).toEqual(
      expect.arrayContaining(['command:build', 'subagent:reviewer'])
    );
    expect(resolved.allowedSharedMcpIds).toEqual(['shared-alpha']);
    expect(resolved.allowedPersonalMcpIds).toEqual(['personal-alpha']);
    expect(resolved.capabilityProvenance['legacy-skill:ship']).toEqual({
      source: 'session-policy',
      decision: 'allow',
    });
    expect(resolved.capabilityProvenance['command:build']).toEqual({
      source: 'session-policy',
      decision: 'block',
    });
  });
});
