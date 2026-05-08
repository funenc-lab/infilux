import { describe, expect, it } from 'vitest';
import { agentPanelSource } from './agentPanelSource';

describe('agentPanelStoreSubscriptionPolicy', () => {
  it('avoids whole-store terminal subscriptions for quick terminal state', () => {
    expect(agentPanelSource).not.toContain(
      'const { getQuickTerminalSession, setQuickTerminalSession, removeQuickTerminalSession } =\n    useTerminalStore();'
    );
    expect(agentPanelSource).toContain('const currentQuickTerminalSession = useTerminalStore(');
    expect(agentPanelSource).toContain('const setQuickTerminalSession = useTerminalStore(');
    expect(agentPanelSource).toContain('const removeQuickTerminalSession = useTerminalStore(');
  });

  it('avoids whole-store worktree activity subscriptions', () => {
    expect(agentPanelSource).not.toContain(
      'const { setAgentCount, registerAgentCloseHandler } = useWorktreeActivityStore();'
    );
    expect(agentPanelSource).toContain('const setAgentCount = useWorktreeActivityStore(');
    expect(agentPanelSource).toContain(
      'const registerAgentCloseHandler = useWorktreeActivityStore('
    );
  });
});
