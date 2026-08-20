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

  it('offers interface font selection through a concrete font-family picker', () => {
    expect(appearanceSettingsSource).toContain("from './FontFamilyPresetSelect'");
    expect(appearanceSettingsSource).toContain('buildInterfaceFontPresetSelection');
    expect(appearanceSettingsSource).toContain('<FontFamilyPresetSelect');
    expect(appearanceSettingsSource).toContain('label="Font family"');
    expect(appearanceSettingsSource).not.toContain('label="Recommended font stack"');
    expect(appearanceSettingsSource).toContain(
      'applyFontPresetSelection(uiFontPresetSelection, presetId, setAppFontFamily)'
    );
    expect(appearanceSettingsSource).not.toContain('const applyAppFontFamilyChange');
    expect(appearanceSettingsSource).not.toContain('localAppFontFamily');
    expect(appearanceSettingsSource).not.toContain('placeholder="system-ui, sans-serif"');
  });

  it('places interface typography before the color scheme browser', () => {
    const interfaceTypographyIndex = appearanceSettingsSource.indexOf(
      '<h3 className="ui-type-section-title">{t(\'Interface typography\')}</h3>'
    );
    const colorSchemeIndex = appearanceSettingsSource.indexOf(
      '<h3 className="ui-type-section-title">{t(\'Color scheme\')}</h3>'
    );

    expect(interfaceTypographyIndex).toBeGreaterThanOrEqual(0);
    expect(colorSchemeIndex).toBeGreaterThanOrEqual(0);
    expect(interfaceTypographyIndex).toBeLessThan(colorSchemeIndex);
  });
});
