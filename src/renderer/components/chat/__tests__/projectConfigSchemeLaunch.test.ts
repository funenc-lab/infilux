import type {
  ClaudePolicyConfig,
  ProjectConfigScheme,
  ProjectConfigSchemeSelection,
  PromptPreset,
  WorktreeConfigSchemeSelection,
} from '@shared/types';
import { describe, expect, it } from 'vitest';
import { resolveProjectConfigSchemeLaunchState } from '../projectConfigSchemeLaunch';

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
      allowedSharedMcpIds: ['shared-search'],
    }),
    promptPresetId: 'prompt-alpha',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function createPrompt(overrides: Partial<PromptPreset> = {}): PromptPreset {
  return {
    id: 'prompt-alpha',
    name: 'Alpha Prompt',
    content: 'Use the alpha workflow.',
    enabled: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

const repositorySelection: ProjectConfigSchemeSelection = {
  schemeId: 'scheme-alpha',
  updatedAt: 1,
};

const worktreeSelection: WorktreeConfigSchemeSelection = {
  repoPath: '/repo',
  schemeId: 'scheme-beta',
  updatedAt: 2,
};

describe('project config scheme launch state', () => {
  it('applies repository scheme policy when direct policy is missing', () => {
    const state = resolveProjectConfigSchemeLaunchState({
      repoPath: '/repo',
      worktreePath: '/repo/worktrees/feature',
      schemes: [createScheme()],
      promptPresets: [],
      repositorySelection,
      worktreeSelection: null,
      directProjectPolicy: null,
      directWorktreePolicy: null,
      existingInitialPrompt: null,
    });

    expect(state.projectPolicy).toEqual(
      expect.objectContaining({
        repoPath: '/repo',
        allowedCapabilityIds: ['legacy-skill:planner'],
        allowedSharedMcpIds: ['shared-search'],
      })
    );
    expect(state.worktreePolicy).toBeNull();
  });

  it('lets direct project policy override selected scheme policy', () => {
    const state = resolveProjectConfigSchemeLaunchState({
      repoPath: '/repo',
      worktreePath: '/repo/worktrees/feature',
      schemes: [createScheme()],
      promptPresets: [],
      repositorySelection,
      worktreeSelection: null,
      directProjectPolicy: {
        repoPath: '/repo',
        ...createPolicy({
          blockedCapabilityIds: ['legacy-skill:planner'],
          blockedSharedMcpIds: ['shared-search'],
        }),
      },
      directWorktreePolicy: null,
      existingInitialPrompt: null,
    });

    expect(state.projectPolicy?.allowedCapabilityIds).toEqual([]);
    expect(state.projectPolicy?.blockedCapabilityIds).toEqual(['legacy-skill:planner']);
    expect(state.projectPolicy?.allowedSharedMcpIds).toEqual([]);
    expect(state.projectPolicy?.blockedSharedMcpIds).toEqual(['shared-search']);
  });

  it('applies worktree scheme policy and prompt before repository scheme prompt', () => {
    const state = resolveProjectConfigSchemeLaunchState({
      repoPath: '/repo',
      worktreePath: '/repo/worktrees/feature',
      schemes: [
        createScheme({ id: 'scheme-alpha', promptPresetId: 'prompt-alpha' }),
        createScheme({
          id: 'scheme-beta',
          promptPresetId: 'prompt-beta',
          claudePolicy: createPolicy({ blockedPersonalMcpIds: ['personal-db'] }),
        }),
      ],
      promptPresets: [
        createPrompt({ id: 'prompt-alpha', content: 'Repository prompt.' }),
        createPrompt({ id: 'prompt-beta', content: 'Worktree prompt.' }),
      ],
      repositorySelection,
      worktreeSelection,
      directProjectPolicy: null,
      directWorktreePolicy: null,
      existingInitialPrompt: null,
    });

    expect(state.worktreePolicy).toEqual(
      expect.objectContaining({
        repoPath: '/repo',
        worktreePath: '/repo/worktrees/feature',
        blockedPersonalMcpIds: ['personal-db'],
      })
    );
    expect(state.initialPrompt).toBe('Worktree prompt.');
  });

  it('ignores a stored worktree scheme when it belongs to a different repository', () => {
    const state = resolveProjectConfigSchemeLaunchState({
      repoPath: '/repo',
      worktreePath: '/repo/worktrees/feature',
      schemes: [
        createScheme({ id: 'scheme-alpha', promptPresetId: 'prompt-alpha' }),
        createScheme({
          id: 'scheme-beta',
          promptPresetId: 'prompt-beta',
          claudePolicy: createPolicy({ blockedPersonalMcpIds: ['personal-db'] }),
        }),
      ],
      promptPresets: [
        createPrompt({ id: 'prompt-alpha', content: 'Repository prompt.' }),
        createPrompt({ id: 'prompt-beta', content: 'Worktree prompt.' }),
      ],
      repositorySelection,
      worktreeSelection: {
        repoPath: '/other-repo',
        schemeId: 'scheme-beta',
        updatedAt: 3,
      },
      directProjectPolicy: null,
      directWorktreePolicy: null,
      existingInitialPrompt: null,
    });

    expect(state.worktreePolicy).toBeNull();
    expect(state.initialPrompt).toBe('Repository prompt.');
  });

  it('does not apply a scheme prompt when scheme prompt fallback is disabled', () => {
    const state = resolveProjectConfigSchemeLaunchState({
      repoPath: '/repo',
      worktreePath: '/repo/worktrees/feature',
      schemes: [createScheme()],
      promptPresets: [createPrompt()],
      repositorySelection,
      worktreeSelection: null,
      directProjectPolicy: null,
      directWorktreePolicy: null,
      existingInitialPrompt: null,
      applySchemePrompt: false,
    });

    expect(state.projectPolicy).toEqual(
      expect.objectContaining({
        repoPath: '/repo',
        allowedCapabilityIds: ['legacy-skill:planner'],
      })
    );
    expect(state.initialPrompt).toBeNull();
  });

  it('preserves an existing initial prompt instead of replacing it with scheme prompt', () => {
    const state = resolveProjectConfigSchemeLaunchState({
      repoPath: '/repo',
      worktreePath: '/repo/worktrees/feature',
      schemes: [createScheme()],
      promptPresets: [createPrompt()],
      repositorySelection,
      worktreeSelection: null,
      directProjectPolicy: null,
      directWorktreePolicy: null,
      existingInitialPrompt: 'Existing command',
    });

    expect(state.initialPrompt).toBe('Existing command');
  });
});
