import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const agentPanelSource = readFileSync(resolve(currentDir, '../AgentPanel.tsx'), 'utf8');
const agentGroupSource = readFileSync(resolve(currentDir, '../AgentGroup.tsx'), 'utf8');
const sessionBarSource = readFileSync(resolve(currentDir, '../SessionBar.tsx'), 'utf8');

describe('Agent panel subagent inspector wiring', () => {
  it('renders a dedicated floating inspector inside session panels instead of routing to layout overlays', () => {
    expect(agentPanelSource).toContain("from './agent-panel/SessionSubagentInspector'");
    expect(agentPanelSource).toContain('<SessionSubagentInspector');
    expect(agentPanelSource).not.toContain("from '@/components/layout/SubagentTranscriptPanel'");
  });

  it('wires a reusable toolbar accessory path through the group session bar', () => {
    expect(agentGroupSource).toContain('toolbarAccessory?: ReactNode;');
    expect(agentGroupSource).toContain('toolbarAccessory={toolbarAccessory}');
    expect(sessionBarSource).toContain('toolbarAccessory?: React.ReactNode;');
    expect(sessionBarSource).toContain('{toolbarAccessory ? (');
  });

  it('exposes a dedicated trigger button for the session subagent window', () => {
    expect(agentPanelSource).toContain("from './agent-panel/SessionSubagentTriggerButton'");
    expect(agentPanelSource).toContain('<SessionSubagentTriggerButton');
    expect(agentPanelSource).toContain("title={t('View session subagents')}");
  });
});
