import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { agentPanelSource } from './agentPanelSource';

const currentDir = dirname(fileURLToPath(import.meta.url));
const agentGroupEmptyStateSource = readFileSync(
  resolve(currentDir, '../AgentGroupEmptyState.tsx'),
  'utf8'
);
const sessionBarSource = readFileSync(resolve(currentDir, '../SessionBar.tsx'), 'utf8');
const statusLineSource = readFileSync(resolve(currentDir, '../StatusLine.tsx'), 'utf8');

describe('agent menu typography policy', () => {
  it('removes hardcoded profile picker typography from the empty state menu', () => {
    expect(agentPanelSource).toContain('control-menu-label');
    expect(agentPanelSource).not.toContain('text-[11px]');
    expect(agentPanelSource).not.toContain('text-[12px]');
  });

  it('uses the shared menu label and default chip styling across agent menus', () => {
    expect(agentGroupEmptyStateSource).toContain('control-menu-label');
    expect(sessionBarSource).toContain('control-menu-label');
    expect(agentGroupEmptyStateSource).toContain('control-chip control-chip-strong');
    expect(sessionBarSource).toContain('control-chip control-chip-strong');
    expect(statusLineSource).toContain('control-menu-item');
  });
});
