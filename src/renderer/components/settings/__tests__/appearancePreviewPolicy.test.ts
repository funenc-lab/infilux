import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const appearanceSettingsSource = readFileSync(
  resolve(currentDir, '../AppearanceSettings.tsx'),
  'utf8'
);

describe('appearance preview policy', () => {
  it('does not trigger theme previews from hover or focus affordances', () => {
    expect(appearanceSettingsSource).not.toContain('onMouseEnter={onPreview}');
    expect(appearanceSettingsSource).not.toContain(
      "onMouseEnter={() => setLivePreviewTheme('sync-terminal')}"
    );
    expect(appearanceSettingsSource).not.toContain(
      'onMouseEnter={() => setPreviewPreset(option.id)}'
    );
    expect(appearanceSettingsSource).not.toContain('onFocus={() => setPreviewPreset(option.id)}');
    expect(appearanceSettingsSource).not.toContain(
      'onMouseEnter={() => setPreviewCustomThemeId(customTheme.id)}'
    );
    expect(appearanceSettingsSource).not.toContain(
      'onFocus={() => setPreviewCustomThemeId(customTheme.id)}'
    );
    expect(appearanceSettingsSource).not.toContain('onThemeHover?.(themeName)');
  });
});
