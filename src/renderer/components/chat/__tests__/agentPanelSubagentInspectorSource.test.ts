import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const agentPanelSource = readFileSync(resolve(currentDir, '../AgentPanel.tsx'), 'utf8');
const agentGroupSource = readFileSync(resolve(currentDir, '../AgentGroup.tsx'), 'utf8');
const sessionBarSource = readFileSync(resolve(currentDir, '../SessionBar.tsx'), 'utf8');
const triggerButtonSource = readFileSync(
  resolve(currentDir, '../agent-panel/SessionSubagentTriggerButton.tsx'),
  'utf8'
);

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
    expect(agentPanelSource).toContain("from './sessionSubagentTriggerPolicy'");
    expect(agentPanelSource).toContain('resolveSessionSubagentTriggerPresentation(');
    expect(agentPanelSource).toContain('<SessionSubagentTriggerButton');
    expect(agentPanelSource).toContain("title={t('View session subagents')}");
  });

  it('uses a fork-oriented trigger icon with an explicit emphasis state', () => {
    expect(triggerButtonSource).toContain("import { GitFork } from 'lucide-react'");
    expect(triggerButtonSource).toContain("data-emphasized={emphasized ? 'true' : 'false'}");
    expect(triggerButtonSource).toContain('<GitFork className="h-4 w-4" />');
  });

  it('closes the floating inspector when the session layout mode changes', () => {
    expect(agentPanelSource).toContain(
      '// Keep the inspector scoped to the currently active session layout mode.'
    );
    expect(agentPanelSource).toContain('setOpenSessionSubagentInspectorId(null);');
    expect(agentPanelSource).toContain('}, [agentSessionDisplayMode]);');
  });

  it('closes the floating inspector when the trigger becomes unavailable', () => {
    expect(agentPanelSource).toContain(
      'sessionSubagentTriggerPresentationBySessionId[current]?.visible'
    );
    expect(agentPanelSource).toContain('}, [sessionSubagentTriggerPresentationBySessionId]);');
  });

  it('ports the inspector above the canvas transform instead of leaving it inside the session tile', () => {
    expect(agentPanelSource).toContain(
      '// Render the inspector above the canvas transform so it does not scale or pan with tiles.'
    );
    expect(agentPanelSource).toContain('createPortal(sessionSubagentInspector, document.body)');
  });
});
