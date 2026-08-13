import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const settingsShellSource = readFileSync(resolve(__dirname, '../SettingsShell.tsx'), 'utf8');
const constantsSource = readFileSync(resolve(__dirname, '../constants.ts'), 'utf8');
const projectSchemesSectionSource = readFileSync(
  resolve(__dirname, '../project-config-schemes/ProjectConfigSchemesSection.tsx'),
  'utf8'
);
const claudePolicyEditorDialogSource = readFileSync(
  resolve(__dirname, '../claude-policy/ClaudePolicyEditorDialog.tsx'),
  'utf8'
);
const projectConfigSchemeDialogSource = readFileSync(
  resolve(__dirname, '../project-config-schemes/ProjectConfigSchemeDialog.tsx'),
  'utf8'
);

describe('project config schemes settings wiring', () => {
  it('adds a settings category for reusable project schemes', () => {
    expect(constantsSource).toContain("'projectSchemes'");
    expect(settingsShellSource).toContain('ProjectConfigSchemesSection');
    expect(settingsShellSource).toContain("id: 'projectSchemes'");
    expect(settingsShellSource).toContain("activeCategory === 'projectSchemes'");
  });

  it('confirms destructive scheme deletion and labels icon buttons', () => {
    expect(projectSchemesSectionSource).toContain('AlertDialog');
    expect(projectSchemesSectionSource).toContain('deleteSchemeCandidate');
    expect(projectSchemesSectionSource).toContain("aria-label={t('Edit project scheme')}");
    expect(projectSchemesSectionSource).toContain("aria-label={t('Delete project scheme')}");
    expect(projectSchemesSectionSource).toContain('removeProjectConfigSchemeReferences(scheme.id)');
  });

  it('opens the policy editor with project scheme context', () => {
    expect(projectSchemesSectionSource).toContain("title={t('Project Scheme Skill & MCP')}");
    expect(projectSchemesSectionSource).toContain(
      "saveSuccessDescription={t('Project scheme skill and MCP settings were saved.')}"
    );
  });

  it('states the provider scope of scheme skill and MCP controls', () => {
    expect(projectSchemesSectionSource).toContain(
      'Skill and MCP controls apply to Claude, Codex, and Gemini.'
    );
    expect(projectConfigSchemeDialogSource).toContain(
      'Skill and MCP controls apply to Claude, Codex, and Gemini.'
    );
    expect(claudePolicyEditorDialogSource).toContain(
      'Skill and MCP controls apply to Claude, Codex, and Gemini.'
    );
  });

  it('allows schemes to define worktree initialization defaults', () => {
    expect(projectConfigSchemeDialogSource).toContain('worktreeInitialization');
    expect(projectConfigSchemeDialogSource).toContain('Auto-initialize new worktrees');
    expect(projectConfigSchemeDialogSource).toContain('Init Script');
  });

  it('uses stable settings selectors in project scheme surfaces', () => {
    expect(projectSchemesSectionSource).not.toContain('useSettingsStore((state) => ({');
    expect(claudePolicyEditorDialogSource).not.toContain('useSettingsStore((state) => ({');
  });

  it('layers project scheme selects above their modal backdrops', () => {
    expect(claudePolicyEditorDialogSource).toContain('zIndex={Z_INDEX.DROPDOWN_IN_MODAL}');
    expect(projectConfigSchemeDialogSource).toContain('zIndex={Z_INDEX.DROPDOWN_IN_NESTED_MODAL}');
  });
});
