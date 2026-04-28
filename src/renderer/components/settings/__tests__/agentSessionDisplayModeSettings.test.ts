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
  it('uses dedicated display mode cards with workspace canvas support in General Settings', () => {
    expect(agentSessionSectionSource).toContain("t('Agent Session Display')");
    expect(generalSettingsSource).toContain(
      '<div className="border-t pt-4">\n        <h3 className="text-lg font-medium">{t(\'Agent Session Display\')}</h3>'
    );
    expect(agentSessionSectionSource).toContain("t('Choose how agent sessions are displayed')");
    expect(agentSessionSectionSource).toContain('agentSessionDisplayModeOptions.map((option)');
    expect(generalSettingsSource).toContain("value: 'tab'");
    expect(generalSettingsSource).toContain("value: 'canvas'");
    expect(generalSettingsSource).toContain("value: 'global-canvas'");
    expect(generalSettingsSource).toContain("t('Workspace Canvas')");
    expect(generalSettingsSource).toContain(
      "t('Show active worktrees and agent sessions on one shared canvas')"
    );
    expect(generalSettingsSource).toContain('aria-pressed={isSelected}');
    expect(agentSessionSectionSource).toContain('role="group"');
    expect(agentSessionSectionSource).toContain("aria-label={t('Agent Session Display')}");
    expect(agentSessionSectionSource).toContain('agentSessionDisplayMode === option.value');
    expect(agentSessionSectionSource).toContain('setAgentSessionDisplayMode(option.value)');
    expect(generalSettingsSource).not.toContain(
      '<div className="border-t border-border/70 pt-5">\n            <h3 className="text-lg font-medium">{t(\'Agent Session Display\')}</h3>'
    );
    expect(agentSessionSectionSource).not.toContain("t('Quick Terminal')");
    expect(agentSessionSectionSource).not.toContain("t('Todo')");
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
