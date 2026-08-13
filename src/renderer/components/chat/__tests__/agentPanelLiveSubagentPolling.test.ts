import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('AgentPanel live subagent polling contract', () => {
  it('keeps worktree live subagent polling as an active-panel fallback for unresolved provider sessions', () => {
    const agentPanelSource = readFileSync(new URL('../AgentPanel.tsx', import.meta.url), 'utf8');

    expect(agentPanelSource).toContain('const subagentPollingScopeSessions = useMemo(() => {');
    expect(agentPanelSource).toContain('return currentWorktreeSessions;');
    expect(agentPanelSource).toContain('openSessionSubagentInspectorId');
    expect(agentPanelSource).toContain('const fallbackLiveSubagentWorktreePaths = useMemo(() => {');
    expect(agentPanelSource).toContain('!isUnresolvedProviderSession(session)');
    expect(agentPanelSource).toContain(
      'const shouldPollLiveSubagents = isActive && fallbackLiveSubagentWorktreePaths.length > 0;'
    );
    expect(agentPanelSource).toContain(
      'shouldPollLiveSubagents ? fallbackLiveSubagentWorktreePaths : []'
    );
    expect(agentPanelSource).toContain('singleTrackableSessionWorktreePaths');
    expect(agentPanelSource).toContain(
      'supportsSessionSubagentTracking(session.agentId, session.agentCommand)'
    );
    expect(agentPanelSource).toContain('isOpenAgentSession(session)');
    expect(agentPanelSource).toContain('useSessionSubagentsBySession({');
    expect(agentPanelSource).toContain('sessionScopedSubagentsBySessionId[session.id] ?? []');
    expect(agentPanelSource).toContain('getDisplayableSessionSubagents({');
    expect(agentPanelSource).toContain('allowUnresolvedProviderFallback:');
    expect(agentPanelSource).toContain('allowProviderFallback:');
  });

  it('feeds session-scoped subagents into activity state without requiring duplicate worktree polling', () => {
    const agentPanelSource = readFileSync(new URL('../AgentPanel.tsx', import.meta.url), 'utf8');

    expect(agentPanelSource).toContain('const sessionScopedSubagentsByWorktree = useMemo(() => {');
    expect(agentPanelSource).toContain('const activitySubagentsByWorktree = useMemo(() => {');
    expect(agentPanelSource).toContain('subagentsByWorktree: activitySubagentsByWorktree');
  });

  it('hydrates inspector content with dedicated session-scoped polling', () => {
    const inspectorSource = readFileSync(
      new URL('../agent-panel/SessionSubagentInspector.tsx', import.meta.url),
      'utf8'
    );

    expect(inspectorSource).toContain('useSessionSubagents({');
    expect(inspectorSource).toContain("if (viewState.kind === 'supported') {");
    expect(inspectorSource).toContain('hasLoaded: hasLoadedSessionSubagents');
    expect(inspectorSource).toContain(
      'return !hasLoadedSessionSubagents || isLoadingSessionSubagents ? subagents : [];'
    );
  });
});
