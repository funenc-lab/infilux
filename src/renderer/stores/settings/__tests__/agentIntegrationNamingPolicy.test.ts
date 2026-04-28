import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const settingsSource = readFileSync(resolve(currentDir, '../index.ts'), 'utf8');
const settingsTypesSource = readFileSync(resolve(currentDir, '../types.ts'), 'utf8');
const settingsDefaultsSource = readFileSync(resolve(currentDir, '../defaults.ts'), 'utf8');
const integrationSettingsSource = readFileSync(
  resolve(currentDir, '../../../components/settings/IntegrationSettings.tsx'),
  'utf8'
);

describe('agent integration settings naming policy', () => {
  it('uses a generic agent integration store key and setter', () => {
    expect(settingsTypesSource).toContain('agentIntegration: AgentIntegrationSettings;');
    expect(settingsTypesSource).toContain(
      'setAgentIntegration: (settings: Partial<AgentIntegrationSettings>) => void;'
    );
    expect(settingsSource).toContain('agentIntegration: defaultAgentIntegrationSettings');
    expect(settingsSource).toContain('setAgentIntegration: (settings) =>');
    expect(settingsDefaultsSource).toContain('defaultAgentIntegrationSettings');
  });

  it('keeps integration settings UI bound to the generic store key', () => {
    expect(integrationSettingsSource).toContain('const { agentIntegration, setAgentIntegration }');
    expect(integrationSettingsSource).not.toContain('claudeCodeIntegration');
    expect(integrationSettingsSource).not.toContain('setClaudeCodeIntegration');
  });
});
