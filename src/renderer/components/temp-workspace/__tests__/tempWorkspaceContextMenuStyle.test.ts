import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const menuSource = readFileSync(resolve(currentDir, '../TempWorkspaceContextMenu.tsx'), 'utf8');
const globalsSource = readFileSync(resolve(currentDir, '../../../styles/globals.css'), 'utf8');

describe('TempWorkspaceContextMenu style policy', () => {
  it('uses the shared control-menu shell on a flat overlay surface', () => {
    expect(menuSource).toContain('TEMP_WORKSPACE_CONTEXT_MENU_CLASS_NAME');
    expect(menuSource).toContain('control-menu fixed z-50 min-w-40 rounded-2xl p-2');
    expect(globalsSource).toContain('.control-menu {');
    expect(globalsSource).toContain('box-shadow: none;');
  });

  it('uses shared menu item classes instead of local accent hover overrides', () => {
    expect(menuSource).toContain('TEMP_WORKSPACE_CONTEXT_MENU_ITEM_CLASS_NAME');
    expect(menuSource).toContain(
      'control-menu-item flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm'
    );
    expect(menuSource).toContain('TEMP_WORKSPACE_CONTEXT_MENU_DANGER_ITEM_CLASS_NAME');
    expect(menuSource).toContain("'control-menu-item-danger'");
    expect(menuSource).not.toContain('hover:bg-accent/50');
    expect(menuSource).not.toContain('hover:bg-destructive/10');
    expect(menuSource).not.toContain('text-destructive hover:bg-destructive/10');
  });

  it('reuses the shared control divider for context-menu section separators', () => {
    expect(menuSource).toContain('TEMP_WORKSPACE_CONTEXT_MENU_DIVIDER_CLASS_NAME');
    expect(menuSource).toContain("'control-divider my-1 h-px'");
  });
});
