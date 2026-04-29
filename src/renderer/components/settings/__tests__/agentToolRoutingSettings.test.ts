import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const agentSettingsSource = readFileSync(resolve(currentDir, '../AgentSettings.tsx'), 'utf8');

describe('agent tool routing settings', () => {
  it('exposes the default AI tool as a generic routing setting', () => {
    expect(agentSettingsSource).toContain('resolveAgentToolRoutingModel');
    expect(agentSettingsSource).toContain("t('Default AI tool')");
    expect(agentSettingsSource).toContain('value={toolRoutingModel.defaultAgentId}');
    expect(agentSettingsSource).toContain('onValueChange={handleDefaultAgentChange}');
    expect(agentSettingsSource).toContain('setAgentDefault(agentId)');
    expect(agentSettingsSource).not.toContain("t('Default Claude tool')");
  });
});
