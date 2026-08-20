import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const appearanceSettingsSource = readFileSync(
  resolve(currentDir, '../AppearanceSettings.tsx'),
  'utf8'
);

describe('appearance typography policy', () => {
  it('keeps appearance card titles aligned with the shared settings typography scale', () => {
    expect(appearanceSettingsSource).not.toContain(
      'className="text-sm font-semibold tracking-[-0.01em]"'
    );
    expect(appearanceSettingsSource).not.toContain(
      'className="truncate text-sm font-semibold tracking-[-0.01em]"'
    );
    expect(appearanceSettingsSource).not.toContain(
      'className="text-base font-semibold tracking-[-0.015em]"'
    );
  });

  it('offers interface font selection through the recommended picker only', () => {
    expect(appearanceSettingsSource).toContain("t('Recommended font stack')");
    expect(appearanceSettingsSource).toContain('buildInterfaceFontPresetSelection');
    expect(appearanceSettingsSource).toContain('value={uiFontPresetSelection.selectedId}');
    expect(appearanceSettingsSource).toContain('{t(uiFontPresetSelection.selectedLabel)}');
    expect(appearanceSettingsSource).toContain('uiFontPresetSelection.options.map((option) => (');
    expect(appearanceSettingsSource).toContain('if (!nextPreset?.fontFamily)');
    expect(appearanceSettingsSource).toContain('setLocalAppFontFamily(nextPreset.fontFamily)');
    expect(appearanceSettingsSource).not.toContain('const applyAppFontFamilyChange');
    expect(appearanceSettingsSource).not.toContain('value={localAppFontFamily}');
    expect(appearanceSettingsSource).not.toContain('placeholder="system-ui, sans-serif"');
  });
});
