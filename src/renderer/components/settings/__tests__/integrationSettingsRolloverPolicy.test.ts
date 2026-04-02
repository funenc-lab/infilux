import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const integrationSettingsSource = readFileSync(
  resolve(currentDir, '../IntegrationSettings.tsx'),
  'utf8'
);

describe('integration settings rollover policy', () => {
  it('exposes automatic session rollover controls alongside the status line context warnings', () => {
    expect(integrationSettingsSource).toContain('autoSessionRollover');
    expect(integrationSettingsSource).toContain("t('Automatic Session Rollover')");
    expect(integrationSettingsSource).toContain(
      'value={claudeCodeIntegration.autoSessionRollover}'
    );
    expect(integrationSettingsSource).toContain('value="manual"');
    expect(integrationSettingsSource).toContain('value="critical"');
  });
});
