import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const settingsShellSource = readFileSync(resolve(currentDir, '../SettingsShell.tsx'), 'utf8');
const terminalSectionSource = readFileSync(
  resolve(currentDir, '../AppearanceTerminalSettingsSection.tsx'),
  'utf8'
);

describe('settings console surface policy', () => {
  it('keeps the settings shell flat and avoids redundant selected-tab headers', () => {
    expect(settingsShellSource).not.toContain("t('Configuration')");
    expect(settingsShellSource).toContain('const hasSidebarContext = Boolean(repoLabel);');
    expect(settingsShellSource).toContain(
      "'group relative flex shrink-0 items-center gap-2.5 rounded-lg border border-transparent px-3 py-2 text-sm transition-colors lg:w-full'"
    );
    expect(settingsShellSource).not.toContain('control-panel-muted flex shrink-0 items-center');
    expect(terminalSectionSource).toContain('control-panel rounded-xl p-4 md:p-5');
    expect(terminalSectionSource).toContain('control-panel-muted rounded-xl p-4');
  });
});
