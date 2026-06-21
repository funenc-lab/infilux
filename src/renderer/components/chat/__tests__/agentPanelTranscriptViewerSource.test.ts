import { describe, expect, it } from 'vitest';
import { agentPanelSource } from './agentPanelSource';

describe('AgentPanel transcript viewer wiring', () => {
  it('exposes the retained transcript viewer from the active session toolbar', () => {
    expect(agentPanelSource).toContain('AgentSessionTranscriptDrawer');
    expect(agentPanelSource).toContain('setTranscriptSessionId');
    expect(agentPanelSource).toContain("t('Transcript')");
  });
});
