import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const integrationSettingsSource = readFileSync(
  resolve(currentDir, '../IntegrationSettings.tsx'),
  'utf8'
);

describe('agent integration capability settings', () => {
  it('shows capability coverage and avoids Claude-only copy in generic controls', () => {
    expect(integrationSettingsSource).toContain('resolveAgentIntegrationCapabilityModel');
    expect(integrationSettingsSource).toContain("t('Agent capability coverage')");
    expect(integrationSettingsSource).toContain('Currently supported by {{providers}}');
    expect(integrationSettingsSource).toContain("t('Waiting for provider adapter')");

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
