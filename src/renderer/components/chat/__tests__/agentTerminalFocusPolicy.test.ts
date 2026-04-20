import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const agentTerminalSource = readFileSync(resolve(currentDir, '../AgentTerminal.tsx'), 'utf8');

describe('agent terminal focus policy', () => {
  it('re-focuses xterm when users click an already active agent session', () => {
    expect(agentTerminalSource).toContain('const handleClick = useCallback(() => {');
    expect(agentTerminalSource).toContain(
      'requestAnimationFrame(() => terminalFocusRef.current?.());'
    );
    expect(agentTerminalSource).toContain('terminalFocusRef.current?.();');
  });
});
