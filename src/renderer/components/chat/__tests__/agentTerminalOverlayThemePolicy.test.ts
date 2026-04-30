import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const agentTerminalSource = readFileSync(resolve(currentDir, '../AgentTerminal.tsx'), 'utf8');

describe('agent terminal overlay theme policy', () => {
  it('uses the shared themed overlay when remote terminals disconnect', () => {
    expect(agentTerminalSource).not.toContain('bg-background/70 backdrop-blur-sm');
    expect(agentTerminalSource).toContain(
      'bg-[color:color-mix(in_oklch,var(--background)_56%,transparent)] backdrop-blur-[1px]'
    );
  });

  it('uses a polite themed startup overlay for active loading terminals', () => {
    expect(agentTerminalSource).toContain('data-agent-terminal-startup-overlay="true"');
    expect(agentTerminalSource).toContain('role="status"');
    expect(agentTerminalSource).toContain('aria-live="polite"');
    expect(agentTerminalSource).toContain('backdrop-blur-[1px]');
    expect(agentTerminalSource).toContain('border-b-transparent border-r-transparent');
  });
});
