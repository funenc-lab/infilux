import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { supportsClaudeProviderSwitcher } from '../sessionBarProviderPolicy';

const currentDir = dirname(fileURLToPath(import.meta.url));
const sessionBarSource = readFileSync(resolve(currentDir, '../SessionBar.tsx'), 'utf8');

describe('sessionBarProviderSwitcherPolicy', () => {
  it('shows the Claude provider switcher only for Claude sessions or when no session is active', () => {
    expect(supportsClaudeProviderSwitcher(undefined)).toBe(true);
    expect(supportsClaudeProviderSwitcher({ agentId: 'claude', agentCommand: 'claude' })).toBe(
      true
    );
    expect(supportsClaudeProviderSwitcher({ agentId: 'claude-hapi', agentCommand: 'claude' })).toBe(
      true
    );
    expect(supportsClaudeProviderSwitcher({ agentId: 'codex', agentCommand: 'codex' })).toBe(false);
  });

  it('gates SessionBar provider queries and UI off the active session policy', () => {
    expect(sessionBarSource).toContain('supportsClaudeProviderSwitcher');
    expect(sessionBarSource).toContain('const showClaudeProviderSwitcher =');
    expect(sessionBarSource).toContain('enabled: !state.collapsed && showClaudeProviderSwitcher');
    expect(sessionBarSource).toContain('!state.collapsed && showClaudeProviderSwitcher');
  });
});
