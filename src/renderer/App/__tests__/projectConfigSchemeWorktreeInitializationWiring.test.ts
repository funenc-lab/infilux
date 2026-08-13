import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, '../../App.tsx'), 'utf8');

describe('project scheme worktree initialization wiring', () => {
  it('resolves the selected project scheme before scheduling worktree initialization', () => {
    expect(source).toContain('resolveProjectConfigSchemeWorktreeInitialization({');
    expect(source).toContain('getProjectConfigSchemeSelection(selectedRepo)');
    expect(source).toContain('getRepositoryWorktreeInitializationOverride(selectedRepo)');
  });
});
