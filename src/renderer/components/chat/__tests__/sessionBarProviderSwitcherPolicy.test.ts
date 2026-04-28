import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { supportsAgentProviderProfileSwitcher } from '../sessionBarProviderPolicy';

const currentDir = dirname(fileURLToPath(import.meta.url));
const sessionBarSource = readFileSync(resolve(currentDir, '../SessionBar.tsx'), 'utf8');
const sessionBarProviderPolicySource = readFileSync(
  resolve(currentDir, '../sessionBarProviderPolicy.ts'),
  'utf8'
);

describe('sessionBarProviderSwitcherPolicy', () => {
  it('delegates provider profile support to the active adapter session policy', () => {
    expect(supportsAgentProviderProfileSwitcher(undefined)).toBe(true);
    expect(
      supportsAgentProviderProfileSwitcher({ agentId: 'claude', agentCommand: 'claude' })
    ).toBe(true);
    expect(
      supportsAgentProviderProfileSwitcher({ agentId: 'claude-hapi', agentCommand: 'claude' })
    ).toBe(true);
    expect(supportsAgentProviderProfileSwitcher({ agentId: 'codex', agentCommand: 'codex' })).toBe(
      false
    );
    expect(sessionBarProviderPolicySource).toContain('agentProviderProfileAdapter.supportsSession');
    expect(sessionBarProviderPolicySource).not.toContain('supportsClaudeProviderSwitcher');
    expect(sessionBarProviderPolicySource).not.toContain('getAgentInputBaseId');
  });

  it('gates SessionBar provider queries and UI off the active session policy', () => {
    expect(sessionBarSource).toContain('supportsAgentProviderProfileSwitcher');
    expect(sessionBarSource).toContain('const showAgentProviderProfileSwitcher =');
    expect(sessionBarSource).toContain(
      'enabled: !state.collapsed && showAgentProviderProfileSwitcher'
    );
    expect(sessionBarSource).toContain('!state.collapsed && showAgentProviderProfileSwitcher');
  });

  it('keeps SessionBar provider switching behind the generic adapter', () => {
    expect(sessionBarSource).toContain('agentProviderProfileAdapter');
    expect(sessionBarSource).not.toContain('window.electronAPI.claudeProvider');
    expect(sessionBarSource).not.toContain('isClaudeProviderMatch');
    expect(sessionBarSource).not.toContain("['claude-settings'");
  });
});
