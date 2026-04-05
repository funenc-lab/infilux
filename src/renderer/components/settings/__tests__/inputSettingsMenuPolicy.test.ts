import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const settingsShellSource = readFileSync(resolve(currentDir, '../SettingsShell.tsx'), 'utf8');
const integrationSettingsSource = readFileSync(
  resolve(currentDir, '../IntegrationSettings.tsx'),
  'utf8'
);
const inputSettingsSource = readFileSync(resolve(currentDir, '../InputSettings.tsx'), 'utf8');

describe('input settings menu policy', () => {
  it('surfaces input and attachment controls as a dedicated settings category', () => {
    expect(settingsShellSource).toContain(
      "{ id: 'input', icon: Paperclip, label: t('Advanced Features') }"
    );
    expect(settingsShellSource).toContain("{activeCategory === 'input' && <InputSettings />}");
    expect(inputSettingsSource).toContain("t('Advanced Features')");
  });

  it('keeps enhanced input controls out of Claude integration and inside the dedicated page', () => {
    expect(integrationSettingsSource).not.toContain("t('Fallback Composer')");
    expect(inputSettingsSource).toContain("t('Fallback Composer')");
    expect(inputSettingsSource).toContain("t('Claude and Codex now use native terminal input')");
    expect(inputSettingsSource).not.toContain("t('Enhanced Input')");
    expect(inputSettingsSource).toContain('claudeCodeIntegration.enhancedInputEnabled');
    expect(inputSettingsSource).toContain('claudeCodeIntegration.enhancedInputAutoPopup');
  });
});
