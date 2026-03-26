import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const terminalSectionSource = readFileSync(
  resolve(currentDir, '../AppearanceTerminalSettingsSection.tsx'),
  'utf8'
);

describe('appearance terminal theme hierarchy', () => {
  it('prioritizes terminal theme selection over stacked summary badges', () => {
    expect(terminalSectionSource).not.toContain("control-badge'>{t('Current')}");
    expect(terminalSectionSource).not.toContain("t('Theme-aware terminal')");
    expect(terminalSectionSource).toContain("t('Choose a Ghostty color scheme.')");
    expect(terminalSectionSource).toContain("t('Preview the active terminal theme.')");
    expect(terminalSectionSource).toContain(
      '<Collapsible className="control-panel-muted rounded-xl p-4">'
    );
    expect(terminalSectionSource).toContain("t('Advanced')");
  });
});
