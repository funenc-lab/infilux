import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const agentTerminalSource = readFileSync(resolve(currentDir, '../AgentTerminal.tsx'), 'utf8');

describe('agentTerminalSessionPersistencePolicy', () => {
  it('delegates disconnect persistence to the host persistence policy', () => {
    expect(agentTerminalSource).toContain('shouldPersistAgentSessionOnDisconnect');
    expect(agentTerminalSource).toContain(
      'persistOnDisconnect: shouldPersistAgentSessionOnDisconnect(persistenceEnabled)'
    );
    expect(agentTerminalSource).not.toContain('persistOnDisconnect: true');
  });
});
