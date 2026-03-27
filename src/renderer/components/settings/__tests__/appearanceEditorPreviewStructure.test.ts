import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const appearanceSettingsSource = readFileSync(
  resolve(currentDir, '../AppearanceSettings.tsx'),
  'utf8'
);
const appearancePreviewPanelSource = readFileSync(
  resolve(currentDir, '../AppearancePreviewPanel.tsx'),
  'utf8'
);
const appearanceThemeEditorViewSource = readFileSync(
  resolve(currentDir, '../AppearanceThemeEditorView.tsx'),
  'utf8'
);

describe('appearance editor preview structure', () => {
  it('renders editor-state cues instead of a decorative snippet header', () => {
    expect(appearanceSettingsSource).toContain(
      'const previewLineHeight = Math.min(Math.max(lineHeight, 1.28), 1.52);'
    );
    expect(appearanceSettingsSource).toContain(
      'className="grid grid-cols-[minmax(0,1fr)_2.75rem]"'
    );
    expect(appearanceSettingsSource).toContain(
      'className="grid grid-cols-[0.375rem_2.75rem_minmax(0,1fr)] items-start px-3"'
    );
    expect(appearanceSettingsSource).toContain('min-h-[13.5rem] py-2');
    expect(appearanceSettingsSource).toContain('selectionBackground');
    expect(appearanceSettingsSource).toContain('cursorColumn');
    expect(appearanceSettingsSource).toContain('minimapRows');
    expect(appearanceSettingsSource).toContain("decoration: 'inserted'");
    expect(appearanceSettingsSource).toContain("decoration: 'removed'");
    expect(appearanceSettingsSource).toContain('overviewMarkers');
    expect(appearanceSettingsSource).toContain('repeating-linear-gradient');
    expect(appearanceSettingsSource).toContain('src/renderer/theme/preview.ts');
    expect(appearanceSettingsSource).toContain('Selection, cursor, and active line states');
    expect(appearanceSettingsSource).not.toContain('py-0.5 whitespace-pre');
  });

  it('uses streamlined editor preview copy in both preview surfaces', () => {
    expect(appearancePreviewPanelSource).toContain("t('Editor preview')");
    expect(appearanceThemeEditorViewSource).toContain("t('Editor preview')");
    expect(appearancePreviewPanelSource).not.toContain('Theme-aware preview');
    expect(appearanceThemeEditorViewSource).not.toContain('Theme-aware preview');
  });
});
