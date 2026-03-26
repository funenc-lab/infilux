import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const remoteSettingsSource = readFileSync(resolve(currentDir, '../RemoteSettings.tsx'), 'utf8');
const editorSettingsSource = readFileSync(resolve(currentDir, '../EditorSettings.tsx'), 'utf8');
const settingsShellSource = readFileSync(resolve(currentDir, '../SettingsShell.tsx'), 'utf8');

describe('settings typography consistency', () => {
  it('keeps section and page titles on the shared medium-weight settings scale', () => {
    expect(remoteSettingsSource).not.toContain('className="font-semibold text-xl"');
    expect(editorSettingsSource).not.toContain(
      'className="text-sm font-semibold">{t(preset.labelKey)}</p>'
    );
    expect(settingsShellSource).not.toContain(
      'className="mt-2 flex items-center gap-2 text-sm font-semibold text-foreground"'
    );
  });
});
