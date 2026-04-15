import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const agentPanelSource = readFileSync(resolve(currentDir, '../AgentPanel.tsx'), 'utf8');
const agentTerminalSource = readFileSync(resolve(currentDir, '../AgentTerminal.tsx'), 'utf8');
const sessionBarSource = readFileSync(resolve(currentDir, '../SessionBar.tsx'), 'utf8');

describe('agent session launch policy flow', () => {
  it('stores session-local launch policy fields on session records', () => {
    expect(sessionBarSource).toContain('claudeSessionPolicy?: ClaudePolicyConfig | null;');
    expect(sessionBarSource).toContain(
      'claudePolicyMaterializationMode?: ClaudePolicyMaterializationMode;'
    );
  });

  it('passes session-local launch policy fields from AgentPanel into AgentTerminal', () => {
    expect(agentPanelSource).toContain('sessionPolicy={session.claudeSessionPolicy}');
    expect(agentPanelSource).toContain(
      'materializationMode={session.claudePolicyMaterializationMode}'
    );
  });

  it('forwards session-local launch policy fields into Claude launch metadata', () => {
    expect(agentTerminalSource).toContain('sessionPolicy,');
    expect(agentTerminalSource).toContain('materializationMode,');
    expect(agentTerminalSource).toContain('sessionPolicy,');
    expect(agentTerminalSource).toContain('materializationMode,');
  });
});
