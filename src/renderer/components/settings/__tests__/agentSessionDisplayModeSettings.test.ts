import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const generalSettingsSource = readFileSync(resolve(currentDir, '../GeneralSettings.tsx'), 'utf8');
const agentSessionSectionStart = generalSettingsSource.indexOf("t('Agent Session Display')");
const agentSessionSectionEnd = generalSettingsSource.indexOf("t('Panels')");
const agentSessionSectionSource = generalSettingsSource.slice(
  agentSessionSectionStart,
  agentSessionSectionEnd
);

describe('agent session display mode settings', () => {
  it('uses a canvas layout switch with agent-session-specific copy in General Settings', () => {
    expect(agentSessionSectionSource).toContain("t('Agent Session Display')");
    expect(generalSettingsSource).toContain(
      '<div className="border-t pt-4">\n        <h3 className="text-lg font-medium">{t(\'Agent Session Display\')}</h3>'
    );
    expect(agentSessionSectionSource).toContain("t('Canvas Layout')");
    expect(agentSessionSectionSource).toContain(
      "t('Show worktree agent sessions on an infinite canvas instead of tabs')"
    );
    expect(agentSessionSectionSource).toContain("checked={agentSessionDisplayMode === 'canvas'}");
    expect(agentSessionSectionSource).toContain(
      "setAgentSessionDisplayMode(checked ? 'canvas' : 'tab')"
    );
    expect(generalSettingsSource).not.toContain(
      '<div className="border-t border-border/70 pt-5">\n            <h3 className="text-lg font-medium">{t(\'Agent Session Display\')}</h3>'
    );
    expect(agentSessionSectionSource).not.toContain("t('Quick Terminal')");
    expect(agentSessionSectionSource).not.toContain("t('Todo')");
    expect(agentSessionSectionSource).not.toContain("t('Display Mode')");
    expect(agentSessionSectionSource).not.toContain("t('Columns')");
  });

  it('separates quick terminal and todo into a dedicated panels section', () => {
    expect(generalSettingsSource).toContain(
      '<div className="border-t pt-4">\n        <h3 className="text-lg font-medium">{t(\'Panels\')}</h3>'
    );
    expect(generalSettingsSource).toContain(
      "t('Configure optional panels and quick-access tools')"
    );
    expect(generalSettingsSource).toContain("t('Quick Terminal')");
    expect(generalSettingsSource).toContain("t('Todo')");
  });
});
