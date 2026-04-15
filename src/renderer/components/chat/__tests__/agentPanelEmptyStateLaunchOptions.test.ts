import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const emptyStateSource = readFileSync(
  resolve(currentDir, '../agent-panel/AgentPanelEmptyState.tsx'),
  'utf8'
);

describe('AgentPanelEmptyState launch options entry', () => {
  it('accepts a launch-options callback from the parent panel', () => {
    expect(emptyStateSource).toContain(
      'onOpenLaunchOptions: (agentId: string, agentCommand: string) => void;'
    );
  });

  it('renders a Skill & MCP action for supported launch profiles', () => {
    expect(emptyStateSource).toContain(
      'supportsAgentCapabilityPolicyLaunch(profile.agentId, profile.command)'
    );
    expect(emptyStateSource).toContain("aria-label={t('Skill & MCP')}");
    expect(emptyStateSource).toContain('onOpenLaunchOptions(profile.agentId, profile.command);');
  });
});
