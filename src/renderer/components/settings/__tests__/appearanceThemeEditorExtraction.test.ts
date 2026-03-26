import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const appearanceSettingsPath = resolve(currentDir, '../AppearanceSettings.tsx');
const editorViewPath = resolve(currentDir, '../AppearanceThemeEditorView.tsx');
const appearanceSettingsSource = readFileSync(appearanceSettingsPath, 'utf8');

describe('appearance theme editor extraction', () => {
  it('extracts the dedicated theme editor into its own component file', () => {
    expect(existsSync(editorViewPath)).toBe(true);
    expect(appearanceSettingsSource).toContain("from './AppearanceThemeEditorView'");
    expect(appearanceSettingsSource).toContain('<AppearanceThemeEditorView');
  });
});
