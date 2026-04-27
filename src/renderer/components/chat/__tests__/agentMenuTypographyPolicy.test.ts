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
const controlButtonStylesSource = readFileSync(
  resolve(currentDir, '../controlButtonStyles.ts'),
  'utf8'
);
const sessionBarSource = [
  readFileSync(resolve(currentDir, '../SessionBar.tsx'), 'utf8'),
  controlButtonStylesSource,
].join('\n');
const statusLineSource = [
  readFileSync(resolve(currentDir, '../StatusLine.tsx'), 'utf8'),
  controlButtonStylesSource,
].join('\n');

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
    expect(statusLineSource).toContain('CHAT_MENU_ITEM_BASE_CLASS_NAME');
    expect(controlButtonStylesSource).toContain('control-menu-item');
  });

  it('reuses shared button and menu helpers for the agent-group empty state controls', () => {
    expect(agentGroupEmptyStateSource).toContain("from './controlButtonStyles'");
    expect(agentGroupEmptyStateSource).toContain('CHAT_ACTION_BUTTON_PRIMARY_CLASS_NAME');
    expect(agentGroupEmptyStateSource).toContain('CHAT_ACTION_BUTTON_SECONDARY_CLASS_NAME');
    expect(agentGroupEmptyStateSource).toContain('CHAT_MENU_ITEM_BASE_CLASS_NAME');
    expect(agentGroupEmptyStateSource).not.toContain(
      'control-action-button control-action-button-primary min-w-0 rounded-xl px-4 text-sm font-semibold tracking-[-0.01em]'
    );
    expect(agentGroupEmptyStateSource).not.toContain(
      'control-menu-item flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-foreground hover:bg-accent hover:text-accent-foreground'
    );
  });

  it('keeps SessionBar agent menu items shrink-safe beside the default chip', () => {
    expect(sessionBarSource).toContain(
      'control-menu-item flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2 text-foreground'
    );
    expect(sessionBarSource).not.toContain(
      'control-menu-item mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 whitespace-nowrap text-foreground'
    );
  });

  it('uses shared toolbar button class helpers for SessionBar action buttons', () => {
    expect(sessionBarSource).toContain('SESSION_BAR_TOOLBAR_BUTTON_CLASS_NAME');
    expect(sessionBarSource).toContain('SESSION_BAR_SPLIT_ACTION_BUTTON_CLASS_NAME');
    expect(sessionBarSource).toContain('SESSION_BAR_SPLIT_ACTION_GROUP_CLASS_NAME');
    expect(sessionBarSource).toContain("from './controlButtonStyles'");
    expect(sessionBarSource).toContain('CHAT_TOOLBAR_ICON_BUTTON_CLASS_NAME');
    expect(sessionBarSource).toContain('CHAT_MENU_ICON_BUTTON_CLASS_NAME');
  });

  it('keeps provider menu rows and utility toggles inside the shared menu/button family', () => {
    expect(sessionBarSource).toContain('SESSION_BAR_PROVIDER_MENU_ITEM_CLASS_NAME');
    expect(sessionBarSource).toContain('SESSION_BAR_MENU_UTILITY_BUTTON_CLASS_NAME');
    expect(sessionBarSource).toContain('control-menu-item flex w-full min-w-0');
    expect(sessionBarSource).toContain('CHAT_MENU_ITEM_BASE_CLASS_NAME');
  });
});
