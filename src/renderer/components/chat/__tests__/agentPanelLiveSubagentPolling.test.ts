import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('AgentPanel live subagent polling contract', () => {
  it('keeps background polling scoped to the active panel', () => {
    const agentPanelSource = readFileSync(new URL('../AgentPanel.tsx', import.meta.url), 'utf8');

    expect(agentPanelSource).toContain(
      'const shouldPollLiveSubagents =\n' +
        '    isActive &&\n' +
        '    subagentScopeSessions.some((session) =>'
    );
    expect(agentPanelSource).toContain('shouldPollLiveSubagents ? subagentScopeWorktreePaths : []');
    expect(agentPanelSource).toContain(
      'supportsSessionSubagentTracking(session.agentId, session.agentCommand)'
    );
    expect(agentPanelSource).toContain('useSessionSubagentsBySession({');
    expect(agentPanelSource).toContain('sessionScopedSubagentsBySessionId[session.id] ?? []');
    expect(agentPanelSource).toContain('getDisplayableSessionSubagents({');
    expect(agentPanelSource).toContain('allowUnresolvedProviderFallback:');
  });

  it('hydrates inspector content with dedicated session-scoped polling', () => {
    const inspectorSource = readFileSync(
      new URL('../agent-panel/SessionSubagentInspector.tsx', import.meta.url),
      'utf8'
    );

    expect(inspectorSource).toContain('useSessionSubagents({');
    expect(inspectorSource).toContain("if (viewState.kind === 'supported') {");
    expect(inspectorSource).toContain('return isLoadingSessionSubagents ? subagents : [];');
  });
});
