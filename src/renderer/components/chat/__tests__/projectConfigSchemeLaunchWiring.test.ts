import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, '../AgentTerminal.tsx'), 'utf8');

describe('project config scheme launch wiring', () => {
  it('resolves scheme selections before building agent capability launch metadata', () => {
    expect(source).toContain('resolveProjectConfigSchemeLaunchState({');
    expect(source).toContain('getProjectConfigSchemeSelection(repoPath)');
    expect(source).toContain('getWorktreeConfigSchemeSelection(cwd, repoPath)');
    expect(source).toContain('applySchemePrompt: !initialized');
    expect(source).toContain('projectConfigSchemes: state.projectConfigSchemes');
    expect(source).toContain('promptPresets: state.promptPresets');
  });
});
