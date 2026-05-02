import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const integrationSettingsSource = readFileSync(
  resolve(currentDir, '../IntegrationSettings.tsx'),
  'utf8'
);
const capabilityCoveragePanelPath = resolve(currentDir, '../AgentCapabilityCoveragePanel.tsx');
const capabilityCoveragePanelSource = existsSync(capabilityCoveragePanelPath)
  ? readFileSync(capabilityCoveragePanelPath, 'utf8')
  : '';

describe('agent integration capability settings', () => {
  it('shows capability coverage and avoids Claude-only copy in generic controls', () => {
    expect(integrationSettingsSource).toContain('resolveAgentIntegrationCapabilityModel');
    expect(integrationSettingsSource).toContain("from './AgentCapabilityCoveragePanel'");
    expect(integrationSettingsSource).toContain(
      '<AgentCapabilityCoveragePanel model={capabilityModel} />'
    );
    expect(capabilityCoveragePanelSource).toContain('model.providerCoverages.map');
    expect(capabilityCoveragePanelSource).toContain("t('Agent capability coverage')");
    expect(capabilityCoveragePanelSource).toContain("t('Full coverage')");
    expect(capabilityCoveragePanelSource).toContain("t('Partial coverage')");
    expect(capabilityCoveragePanelSource).toContain("t('No coverage')");
    expect(capabilityCoveragePanelSource).toContain('<table');
    expect(capabilityCoveragePanelSource).toContain('model.providers.map');
    expect(capabilityCoveragePanelSource).toContain('capability.providerStatuses.map');
    expect(capabilityCoveragePanelSource).toContain("t('Adapter pending')");
    expect(capabilityCoveragePanelSource).toContain("t('Supported')");
    expect(capabilityCoveragePanelSource).not.toContain('Currently supported by {{providers}}');
    expect(capabilityCoveragePanelSource).not.toContain('min-w-24');

    expect(integrationSettingsSource).not.toContain(
      "t('Delay before sending selection changes to Claude Code')"
    );
    expect(integrationSettingsSource).not.toContain("t('Send selected code range to Claude Code')");
    expect(integrationSettingsSource).not.toContain(
      "t('Use Claude Stop hook for precise agent completion notifications')"
    );
    expect(integrationSettingsSource).not.toContain(
      "t('Notify when Claude asks a question (requires PermissionRequest hook)')"
    );
  });
});
