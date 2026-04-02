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

  it('keeps SessionBar agent menu items shrink-safe beside the default chip', () => {
    expect(sessionBarSource).toContain(
      'control-menu-item mt-1 flex w-full min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-foreground'
    );
    expect(sessionBarSource).not.toContain(
      'control-menu-item mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 whitespace-nowrap text-foreground'
    );
  });

  it('uses shared toolbar button class helpers for SessionBar action buttons', () => {
    expect(sessionBarSource).toContain('SESSION_BAR_TOOLBAR_BUTTON_CLASS_NAME');
    expect(sessionBarSource).toContain('SESSION_BAR_SPLIT_ACTION_BUTTON_CLASS_NAME');
    expect(sessionBarSource).toContain('SESSION_BAR_SPLIT_ACTION_GROUP_CLASS_NAME');
  });
});
