import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const agentPanelSource = readFileSync(resolve(currentDir, '../AgentPanel.tsx'), 'utf8');

describe('session persistence notice wiring', () => {
  it('checks tmux availability and exposes a one-click recovery enable action', () => {
    expect(agentPanelSource).toMatch(
      /window\.electronAPI\.tmux\s*\.\s*check\(repoPath,\s*false\)/m
    );
    expect(agentPanelSource).toMatch(/window\.electronAPI\.tmux\s*\.\s*check\(repoPath,\s*true\)/m);
    expect(agentPanelSource).toContain('shouldShowSessionPersistenceNotice({');
    expect(agentPanelSource).toContain('<SessionPersistenceNotice');
    expect(agentPanelSource).toContain('setClaudeCodeIntegration({ tmuxEnabled: true });');
  });
});
