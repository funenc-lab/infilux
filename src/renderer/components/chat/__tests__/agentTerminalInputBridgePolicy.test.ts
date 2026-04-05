import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const agentTerminalSource = readFileSync(resolve(currentDir, '../AgentTerminal.tsx'), 'utf8');

describe('agent terminal native input bridge policy', () => {
  it('routes composed agent input through the dedicated preload bridge', () => {
    expect(agentTerminalSource).toMatch(/window\.electronAPI\.agentInput\s*\.dispatch/);
  });

  it('passes the current agent id as a dispatch hint for legacy live sessions', () => {
    expect(agentTerminalSource).toMatch(
      /window\.electronAPI\.agentInput[\s\S]*dispatch\(\{[\s\S]*sessionId:\s*inputDispatchSessionId,[\s\S]*agentId,[\s\S]*text:/
    );
  });

  it('persists agent metadata with the live session so main-process dispatch can resolve provider policy', () => {
    expect(agentTerminalSource).toMatch(
      /metadata:[\s\S]*\{[\s\S]*uiSessionId:\s*terminalSessionId,[\s\S]*agentId,[\s\S]*agentCommand,[\s\S]*environment,/
    );
  });
});
