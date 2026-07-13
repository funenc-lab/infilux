import { describe, expect, it } from 'vitest';
import type { ClaudePolicyConfig, ProjectConfigScheme } from '..';
import {
  createEmptyProjectConfigSchemePolicy,
  resolveProjectConfigSchemePolicy,
  resolveProjectConfigSchemePromptPresetId,
  sanitizeProjectConfigSchemes,
} from '..';

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
    claudePolicy: createPolicy({
      allowedCapabilityIds: ['legacy-skill:planner'],
      blockedSharedMcpIds: ['dangerous-mcp'],
    }),
    promptPresetId: 'prompt-alpha',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('project config scheme helpers', () => {
  it('creates an empty policy with stable list defaults', () => {
    expect(createEmptyProjectConfigSchemePolicy(12)).toEqual({
      allowedCapabilityIds: [],
      blockedCapabilityIds: [],
      allowedSharedMcpIds: [],
      blockedSharedMcpIds: [],
      allowedPersonalMcpIds: [],
      blockedPersonalMcpIds: [],
      updatedAt: 12,
    });
  });

  it('uses repository scheme policy when no direct project policy exists', () => {
    const resolved = resolveProjectConfigSchemePolicy({
      schemes: [createScheme()],
      selectedSchemeId: 'scheme-alpha',
      directPolicy: null,
    });

    expect(resolved?.allowedCapabilityIds).toEqual(['legacy-skill:planner']);
    expect(resolved?.blockedSharedMcpIds).toEqual(['dangerous-mcp']);
  });

  it('lets direct policy decisions override selected scheme decisions', () => {
    const resolved = resolveProjectConfigSchemePolicy({
      schemes: [createScheme()],
      selectedSchemeId: 'scheme-alpha',
      directPolicy: createPolicy({
        blockedCapabilityIds: ['legacy-skill:planner'],
        allowedSharedMcpIds: ['dangerous-mcp'],
      }),
    });

    expect(resolved?.allowedCapabilityIds).toEqual([]);
    expect(resolved?.blockedCapabilityIds).toEqual(['legacy-skill:planner']);
    expect(resolved?.blockedSharedMcpIds).toEqual([]);
    expect(resolved?.allowedSharedMcpIds).toEqual(['dangerous-mcp']);
  });

  it('returns the worktree prompt preset before the repository prompt preset', () => {
    const promptPresetId = resolveProjectConfigSchemePromptPresetId({
      schemes: [
        createScheme({ id: 'repo-scheme', promptPresetId: 'repo-prompt' }),
        createScheme({ id: 'worktree-scheme', promptPresetId: 'worktree-prompt' }),
      ],
      repositorySchemeId: 'repo-scheme',
      worktreeSchemeId: 'worktree-scheme',
    });

    expect(promptPresetId).toBe('worktree-prompt');
  });

  it('falls back to repository prompt preset when worktree scheme is missing', () => {
    const promptPresetId = resolveProjectConfigSchemePromptPresetId({
      schemes: [createScheme({ id: 'repo-scheme', promptPresetId: 'repo-prompt' })],
      repositorySchemeId: 'repo-scheme',
      worktreeSchemeId: 'missing-scheme',
    });

    expect(promptPresetId).toBe('repo-prompt');
  });

  it('sanitizes persisted scheme records and drops malformed entries', () => {
    const schemes = sanitizeProjectConfigSchemes([
      {
        id: 'scheme-alpha',
        name: 'Alpha',
        description: 42,
        claudePolicy: {
          allowedCapabilityIds: ['legacy-skill:planner', '', 'legacy-skill:planner'],
          blockedCapabilityIds: 'invalid',
          allowedSharedMcpIds: ['shared-search'],
          blockedSharedMcpIds: [null, 'shared-danger'],
          allowedPersonalMcpIds: [],
          blockedPersonalMcpIds: ['personal-db'],
          updatedAt: Number.NaN,
        },
        promptPresetId: '',
        createdAt: 'invalid',
        updatedAt: 9,
      },
      {
        id: '',
        name: 'Missing id',
        claudePolicy: createPolicy(),
      },
      null,
    ]);

    expect(schemes).toEqual([
      {
        id: 'scheme-alpha',
        name: 'Alpha',
        description: '',
        claudePolicy: {
          allowedCapabilityIds: ['legacy-skill:planner'],
          blockedCapabilityIds: [],
          allowedSharedMcpIds: ['shared-search'],
          blockedSharedMcpIds: ['shared-danger'],
          allowedPersonalMcpIds: [],
          blockedPersonalMcpIds: ['personal-db'],
          updatedAt: 0,
        },
        promptPresetId: null,
        createdAt: 0,
        updatedAt: 9,
      },
    ]);
  });
});
