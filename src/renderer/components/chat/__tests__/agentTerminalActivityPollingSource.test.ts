import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const agentTerminalSource = readFileSync(resolve(currentDir, '../AgentTerminal.tsx'), 'utf8');

describe('agent terminal activity polling source', () => {
  it('derives the activity polling interval from the terminal visibility state', () => {
    expect(agentTerminalSource).toContain('resolveAgentTerminalActivityPollIntervalMs');
    expect(agentTerminalSource).toContain(
      'const activityPollIntervalMs = resolveAgentTerminalActivityPollIntervalMs({'
    );
    expect(agentTerminalSource).toContain('isActive: effectiveIsActive');
    expect(agentTerminalSource).toContain('}, activityPollIntervalMs);');
  });

  it('restarts activity polling when the effective terminal visibility changes mid-run', () => {
    expect(agentTerminalSource).toContain(
      'if (!isMonitoringOutputRef.current || !activityPollIntervalRef.current) {'
    );
    expect(agentTerminalSource).toContain('startActivityPolling();');
    expect(agentTerminalSource).toContain('}, [startActivityPolling]);');
  });
});
