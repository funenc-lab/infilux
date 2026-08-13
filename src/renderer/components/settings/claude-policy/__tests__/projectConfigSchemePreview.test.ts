import type { ClaudePolicyConfig, ProjectConfigScheme } from '@shared/types';
import { describe, expect, it } from 'vitest';
import { resolveProjectConfigSchemePreviewPolicies } from '../projectConfigSchemePreview';

function createPolicy(overrides: Partial<ClaudePolicyConfig> = {}): ClaudePolicyConfig {
  return {
    allowedCapabilityIds: [],
    blockedCapabilityIds: [],
    allowedSharedMcpIds: [],
    blockedSharedMcpIds: [],
    allowedPersonalMcpIds: [],
    blockedPersonalMcpIds: [],
    updatedAt: 0,
    ...overrides,
  };
}

function createScheme(overrides: Partial<ProjectConfigScheme> = {}): ProjectConfigScheme {
  return {
    id: 'scheme-alpha',
    name: 'Alpha',
    description: '',
    claudePolicy: createPolicy(),
    promptPresetId: null,
    worktreeInitialization: {
      autoInitWorktree: false,
      initScript: '',
    },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('project config scheme preview policy resolution', () => {
  it('builds preview policies from selected schemes and direct overrides', () => {
    const policies = resolveProjectConfigSchemePreviewPolicies({
      repoPath: '/repo',
      worktreePath: '/repo/worktrees/feature',
      schemes: [
        createScheme({
          id: 'repo-scheme',
          claudePolicy: createPolicy({
            allowedCapabilityIds: ['legacy-skill:planner'],
            allowedSharedMcpIds: ['shared-search'],
          }),
        }),
        createScheme({
          id: 'worktree-scheme',
          claudePolicy: createPolicy({
            allowedPersonalMcpIds: ['personal-db'],
          }),
        }),
      ],
      repositorySchemeId: 'repo-scheme',
      worktreeSchemeId: 'worktree-scheme',
      projectPolicy: createPolicy({
        blockedCapabilityIds: ['legacy-skill:planner'],
      }),
      worktreePolicy: createPolicy({
        blockedPersonalMcpIds: ['personal-db'],
      }),
    });

    expect(policies.projectPolicy).toEqual(
      expect.objectContaining({
        repoPath: '/repo',
        allowedCapabilityIds: [],
        blockedCapabilityIds: ['legacy-skill:planner'],
        allowedSharedMcpIds: ['shared-search'],
      })
    );
    expect(policies.worktreePolicy).toEqual(
      expect.objectContaining({
        repoPath: '/repo',
        worktreePath: '/repo/worktrees/feature',
        allowedPersonalMcpIds: [],
        blockedPersonalMcpIds: ['personal-db'],
      })
    );
  });
});
