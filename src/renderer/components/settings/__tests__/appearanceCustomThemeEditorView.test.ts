import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const appearanceSettingsSource = readFileSync(
  resolve(currentDir, '../AppearanceSettings.tsx'),
  'utf8'
);
const editorViewSource = readFileSync(
  resolve(currentDir, '../AppearanceThemeEditorView.tsx'),
  'utf8'
);

describe('appearance custom theme editor view', () => {
  it('uses a dedicated theme editor view instead of an inline embedded editor block', () => {
    expect(appearanceSettingsSource).toContain("t('Edit selected')");
    expect(appearanceSettingsSource).not.toContain(
      "t('Select a custom theme to edit, or duplicate a preset first.')"
    );
    expect(editorViewSource).toContain("t('Back to appearance')");
  });
});
