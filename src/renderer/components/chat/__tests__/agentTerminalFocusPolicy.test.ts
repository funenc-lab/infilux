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

  it('registers external terminal focus through the IME-safe xterm input helper', () => {
    expect(agentTerminalSource).toContain(
      'register(terminalSessionId, write, () => focusXtermTextInput(terminal));'
    );
    expect(agentTerminalSource).not.toContain(
      'register(terminalSessionId, write, () => terminal?.focus());'
    );
  });

  it('memoizes capability policy reads so parent rerenders do not parse storage repeatedly', () => {
    expect(agentTerminalSource).toContain('const agentCapabilityPolicies = useMemo(');
    expect(agentTerminalSource).toContain('const agentLaunchMetadata = useMemo(');
    expect(agentTerminalSource).toContain('metadata: agentLaunchMetadata,');
    expect(agentTerminalSource).not.toContain('const globalPolicy = getClaudeGlobalPolicy();');
    expect(agentTerminalSource).not.toContain(
      'const projectPolicy = repoPath ? getClaudeProjectPolicy(repoPath) : null;'
    );
    expect(agentTerminalSource).not.toContain(
      'const worktreePolicy = cwd ? getClaudeWorktreePolicy(cwd) : null;'
    );
  });
});
