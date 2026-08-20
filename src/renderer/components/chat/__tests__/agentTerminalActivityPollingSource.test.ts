import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const agentTerminalSource = readFileSync(resolve(currentDir, '../AgentTerminal.tsx'), 'utf8');

describe('agent terminal activity polling source', () => {
  it('registers backend sessions with the window activity scheduler', () => {
    expect(agentTerminalSource).toContain(
      "import { useAgentSessionActivity } from './useAgentSessionActivity';"
    );
    expect(agentTerminalSource).toContain('const sessionActivity = useAgentSessionActivity({');
    expect(agentTerminalSource).toContain('sessionId: activityBackendSessionId');
    expect(agentTerminalSource).toContain('isActive: effectiveIsActive');
    expect(agentTerminalSource).toContain('isVisible: effectiveIsVisible');
    expect(agentTerminalSource).toContain(
      'const effectiveIsActive = isAgentStartupReady ? isActive : false;'
    );
    expect(agentTerminalSource).toContain(
      'const effectiveIsVisible = isReadOnlyTranscript ? isVisible : isVisible && isAgentStartupReady;'
    );
    expect(agentTerminalSource).toContain('onSessionIdChange: handleBackendSessionIdChange');
  });

  it('uses output-driven activity refresh without component-local polling intervals', () => {
    expect(agentTerminalSource).toContain('recordSessionActivityOutput();');
    expect(agentTerminalSource).toContain('startActivityPolling();');
    expect(agentTerminalSource).not.toContain('window.electronAPI.session.getActivity');
    expect(agentTerminalSource).not.toContain('activityPollIntervalRef');
  });
});
