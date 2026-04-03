import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const integrationSettingsSource = readFileSync(
  resolve(currentDir, '../IntegrationSettings.tsx'),
  'utf8'
);
const agentSettingsSource = readFileSync(resolve(currentDir, '../AgentSettings.tsx'), 'utf8');

describe('agent session recovery copy', () => {
  it('describes tmux recovery as a local agent session capability', () => {
    expect(integrationSettingsSource).toContain(
      "t('Wrap local agent sessions in tmux for session persistence and recovery')"
    );
    expect(integrationSettingsSource).not.toContain(
      "t('Wrap Claude agent in tmux for session persistence and recovery')"
    );
  });

  it('does not claim that only Claude supports session persistence', () => {
    expect(agentSettingsSource).toContain('Local session recovery depends on the tmux setting.');
    expect(agentSettingsSource).not.toContain('Only Claude supports session persistence for now.');
  });
});
