import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const agentTerminalSource = readFileSync(resolve(currentDir, '../AgentTerminal.tsx'), 'utf8');

describe('agent terminal dead-session recovery policy', () => {
  it('disables automatic dead-session recovery so exited agent sessions stay inspectable', () => {
    expect(agentTerminalSource).toMatch(/retryOnDeadSession:\s*false/);
  });
});
