import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const appearanceSettingsSource = readFileSync(
  resolve(currentDir, '../AppearanceSettings.tsx'),
  'utf8'
);

describe('appearance editor sample policy', () => {
  it('uses current theme terminology in the editor sample copy', () => {
    expect(appearanceSettingsSource).not.toContain('ThemePreset');
    expect(appearanceSettingsSource).not.toContain('syncTheme');
    expect(appearanceSettingsSource).not.toContain('preview: "live"');
    expect(appearanceSettingsSource).toContain('ColorPreset');
  });
});
