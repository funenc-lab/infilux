import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const appearanceSettingsSource = readFileSync(
  resolve(currentDir, '../AppearanceSettings.tsx'),
  'utf8'
);
const appearanceThemeEditorSource = readFileSync(
  resolve(currentDir, '../AppearanceThemeEditorView.tsx'),
  'utf8'
);
const terminalSettingsSource = readFileSync(
  resolve(currentDir, '../AppearanceTerminalSettingsSection.tsx'),
  'utf8'
);
const editorSettingsSource = readFileSync(resolve(currentDir, '../EditorSettings.tsx'), 'utf8');

describe('font family selection policy', () => {
  it('uses the shared font picker for every font-family setting surface', () => {
    expect(appearanceThemeEditorSource).toContain('<FontFamilyPresetSelect');
    expect(terminalSettingsSource).toContain('<FontFamilyPresetSelect');
    expect(editorSettingsSource).toContain('<FontFamilyPresetSelect');
    expect(terminalSettingsSource).not.toContain('value={localFontFamily}');
    expect(editorSettingsSource).not.toContain('value={localFontFamily}');
  });

  it('uses local system fonts when the catalog is available', () => {
    expect(appearanceSettingsSource).toContain("from '@/hooks/useSystemFontCatalog'");
    expect(appearanceSettingsSource).toContain('buildLocalFontPresetOptions(systemFontFamilies');
    expect(appearanceSettingsSource).toContain(
      'buildLocalFontPresetOptions(\n            monospaceFamilies'
    );
    expect(editorSettingsSource).toContain("from '@/hooks/useSystemFontCatalog'");
    expect(editorSettingsSource).toContain(
      'buildLocalFontPresetOptions(\n            monospaceFamilies'
    );
  });
});
