import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, '../ClaudePolicyEditorDialog.tsx'), 'utf8');

describe('project config scheme policy selection wiring', () => {
  it('allows project and worktree policy dialogs to save selected schemes', () => {
    expect(source).toContain('projectConfigSchemes: state.projectConfigSchemes');
    expect(source).toContain('saveProjectConfigSchemeSelection(repoPath');
    expect(source).toContain('saveWorktreeConfigSchemeSelection(repoPath');
    expect(source).toContain(
      'getWorktreeConfigSchemeSelection(worktreePath || repoPath, repoPath)'
    );
    expect(source).toContain('resolveProjectConfigSchemePreviewPolicies({');
    expect(source).toContain('onConfigSchemeSelectionChange?.()');
  });
});
