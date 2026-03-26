import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const appearanceSettingsPath = resolve(currentDir, '../AppearanceSettings.tsx');
const previewPanelPath = resolve(currentDir, '../AppearancePreviewPanel.tsx');
const terminalSectionPath = resolve(currentDir, '../AppearanceTerminalSettingsSection.tsx');
const appearanceSettingsSource = readFileSync(appearanceSettingsPath, 'utf8');

describe('appearance section extraction', () => {
  it('extracts the preview panel and terminal settings section into focused component files', () => {
    expect(existsSync(previewPanelPath)).toBe(true);
    expect(existsSync(terminalSectionPath)).toBe(true);
    expect(appearanceSettingsSource).toContain("from './AppearancePreviewPanel'");
    expect(appearanceSettingsSource).toContain("from './AppearanceTerminalSettingsSection'");
    expect(appearanceSettingsSource).toContain('<AppearancePreviewPanel');
    expect(appearanceSettingsSource).toContain('<AppearanceTerminalSettingsSection');
  });
});
