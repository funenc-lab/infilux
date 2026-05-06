import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, '../../../../..');
const agentProviderListPath = resolve(currentDir, '../agent-provider/ProviderList.tsx');
const agentProviderDialogPath = resolve(currentDir, '../agent-provider/ProviderDialog.tsx');
const agentProviderEntryPath = resolve(
  repoRoot,
  'src/renderer/components/settings/agent-provider/index.ts'
);
const providerListSource = existsSync(agentProviderListPath)
  ? readFileSync(agentProviderListPath, 'utf8')
  : '';
const providerDialogSource = existsSync(agentProviderDialogPath)
  ? readFileSync(agentProviderDialogPath, 'utf8')
  : '';
const integrationSettingsSource = readFileSync(
  resolve(currentDir, '../IntegrationSettings.tsx'),
  'utf8'
);
const actionPanelSource = readFileSync(resolve(currentDir, '../../layout/ActionPanel.tsx'), 'utf8');
const sessionBarSource = readFileSync(resolve(currentDir, '../../chat/SessionBar.tsx'), 'utf8');
const appSource = readFileSync(resolve(currentDir, '../../../App.tsx'), 'utf8');
const providerListenerSource = readFileSync(
  resolve(currentDir, '../../../App/hooks/useAgentProviderProfileListener.ts'),
  'utf8'
);
const adapterPath = resolve(repoRoot, 'src/renderer/lib/agentProviderProfiles.ts');

describe('agent provider adapter policy', () => {
  it('keeps provider profile IO behind a generic renderer adapter', () => {
    expect(existsSync(adapterPath)).toBe(true);
    const adapterSource = readFileSync(adapterPath, 'utf8');
    expect(adapterSource).toContain('window.electronAPI.agentProvider');
    expect(adapterSource).not.toContain('window.electronAPI.claudeProvider');
  });

  it('routes integration settings through the generic provider UI entry point', () => {
    expect(existsSync(agentProviderEntryPath)).toBe(true);
    expect(existsSync(agentProviderListPath)).toBe(true);
    expect(existsSync(agentProviderDialogPath)).toBe(true);
    expect(integrationSettingsSource).toContain("from './agent-provider'");
    expect(integrationSettingsSource).not.toContain("from './claude-provider'");
    expect(readFileSync(agentProviderEntryPath, 'utf8')).not.toContain('claude-provider');
  });

  it('keeps provider profile management ahead of the Claude-only bridge controls', () => {
    expect(integrationSettingsSource.indexOf("t('Agent Providers')")).toBeGreaterThanOrEqual(0);
    expect(integrationSettingsSource.indexOf("t('Agent IDE Bridge')")).toBeGreaterThanOrEqual(0);
    expect(integrationSettingsSource.indexOf("t('Agent Providers')")).toBeLessThan(
      integrationSettingsSource.indexOf("t('Agent IDE Bridge')")
    );
  });

  it('keeps the settings provider list free of direct Claude bridge calls', () => {
    expect(providerListSource).toContain('agentProviderProfileAdapter');
    expect(providerListSource).not.toContain('window.electronAPI.claudeProvider');
    expect(providerListSource).not.toContain('isClaudeProviderMatch');
    expect(providerListSource).not.toContain("['claude-settings'");
  });

  it('keeps provider dialog implementation under the generic provider UI folder', () => {
    expect(providerDialogSource).toContain(
      'Save and switch detected provider profiles for supported Agent CLIs'
    );
    expect(providerDialogSource).toContain('Save Current CLI Config');
    expect(providerDialogSource).toContain('Manual provider settings are for custom gateways');
    expect(providerDialogSource).toContain('buildDefaultProviderProfileName');
    expect(providerDialogSource).toContain('Provider Type');
    expect(providerDialogSource).not.toContain('disabled={isEditing}');
    expect(providerDialogSource).not.toContain('ClaudeProvider');
    expect(providerListSource).not.toContain('ClaudeProvider');
  });

  it('lets provider list inspect the selected provider type instead of defaulting to Claude', () => {
    expect(providerListSource).toContain('selectedProviderId');
    expect(providerListSource).toContain('queryKey(repoPath, selectedProviderId)');
    expect(providerListSource).toContain('readCurrent(repoPath, selectedProviderId)');
  });

  it('defaults provider configuration to detected system provider settings', () => {
    expect(providerListSource).toContain('readAllCurrent(repoPath)');
    expect(providerListSource).toContain('resolveDefaultProviderSelection');
    expect(providerListSource).toContain('manualProviderSelection');
    expect(providerListSource).toContain('setManualProviderSelection(true)');
  });

  it('makes detected CLI settings the primary provider profile workflow', () => {
    expect(providerListSource).toContain('Current CLI Config Detected');
    expect(providerListSource).toContain('Save Current CLI Config');
    expect(providerListSource).toContain('Manual Add Provider');
    expect(providerListSource).toContain('buildAgentProviderDetectionState');
  });

  it('surfaces saved provider capability status in the settings provider list', () => {
    expect(providerListSource).toContain('buildAgentProviderProfileListSummary');
    expect(providerListSource).toContain('{{count}} saved provider profiles');
    expect(providerListSource).toContain('{{count}} switchable');
    expect(providerListSource).toContain('{{count}} waiting for provider adapter');
  });

  it('lets the settings selector inspect every provider type while keeping manual saves adapter-gated', () => {
    expect(providerListSource).toContain('providerSelectionOptions');
    expect(providerListSource).toContain('AI_PROVIDER_OPTIONS');
    expect(providerListSource).toContain('providerSelectionOptions.map');
    expect(providerDialogSource).toContain('providerProfileOptions');
    expect(providerDialogSource).toContain('adapter.supportsProfiles');
    expect(providerDialogSource).toContain('providerProfileOptions.map');
  });

  it('keeps the action panel free of direct Claude provider bridge calls', () => {
    expect(actionPanelSource).toContain('agentProviderProfileAdapter');
    expect(actionPanelSource).not.toContain('window.electronAPI.claudeProvider');
    expect(actionPanelSource).not.toContain('isClaudeProviderMatch');
    expect(actionPanelSource).not.toContain("['claude-settings'");
    expect(actionPanelSource).not.toContain('claude-provider-');
  });

  it('keeps the session bar free of direct Claude provider bridge calls', () => {
    expect(sessionBarSource).toContain('agentProviderProfileAdapter');
    expect(sessionBarSource).not.toContain('window.electronAPI.claudeProvider');
    expect(sessionBarSource).not.toContain('isClaudeProviderMatch');
    expect(sessionBarSource).not.toContain("['claude-settings'");
  });

  it('keeps provider settings change notifications behind the generic adapter', () => {
    expect(appSource).toContain('useAgentProviderProfileListener');
    expect(appSource).not.toContain('useClaudeProviderListener');
    expect(providerListenerSource).toContain('agentProviderProfileAdapter');
    expect(providerListenerSource).not.toContain('window.electronAPI.claudeProvider');
    expect(providerListenerSource).not.toContain('isClaudeProviderMatch');
  });

  it('preserves the detected provider type when opening provider actions from notifications', () => {
    expect(providerListenerSource).toContain(
      'const providerId = data.providerId ?? extracted?.providerId'
    );
    expect(appSource).toContain('detail: { providerId: pendingProviderId }');
    expect(providerListSource).toContain('resolveProviderIdFromActionEvent');
    expect(providerListSource).toContain('setSelectedProviderId(providerId)');
  });
});
