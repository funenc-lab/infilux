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
const actionPanelSource = readFileSync(resolve(currentDir, '../../layout/ActionPanel.tsx'), 'utf8');
const appSource = readFileSync(resolve(currentDir, '../../../App.tsx'), 'utf8');
const appHooksIndexSource = readFileSync(
  resolve(currentDir, '../../../App/hooks/index.ts'),
  'utf8'
);

describe('agent integration naming policy', () => {
  it('names the settings entry as a generic agent integration surface', () => {
    expect(settingsShellSource).toContain(
      "{ id: 'integration', icon: Link, label: t('Agent Integrations') }"
    );
    expect(settingsShellSource).not.toContain("label: t('Claude Integration')");
  });

  it('keeps provider management and bridge controls named as agent-level settings', () => {
    expect(integrationSettingsSource).toContain("t('Agent Integrations')");
    expect(integrationSettingsSource).toContain("t('Agent IDE Bridge')");
    expect(integrationSettingsSource).toContain(
      "t('Start provider-supported editor context and lifecycle hook bridges')"
    );
    expect(integrationSettingsSource).toContain("t('Agent Providers')");
    expect(integrationSettingsSource).toContain(
      "t('Save and switch detected provider profiles for supported Agent CLIs')"
    );
    expect(integrationSettingsSource).not.toContain("t('Claude Code IDE Bridge')");
    expect(integrationSettingsSource).not.toContain("t('Claude Code Integration')");
    expect(integrationSettingsSource).not.toContain(
      "t('Manage Claude API provider configurations')"
    );
  });

  it('uses generic provider grouping in the action panel', () => {
    expect(actionPanelSource).toContain("label: t('Agent Providers')");
    expect(actionPanelSource).not.toContain("label: 'Claude Provider'");
  });

  it('names renderer bridge orchestration as an agent IDE bridge integration', () => {
    expect(appHooksIndexSource).toContain('useAgentIdeBridgeIntegration');
    expect(appHooksIndexSource).not.toContain('useClaudeIntegration');
    expect(appSource).toContain('useAgentIdeBridgeIntegration(activeWorktree?.path ?? null, true)');
    expect(appSource).not.toContain('useClaudeIntegration(activeWorktree?.path ?? null, true)');
  });
});
