import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const actionPanelSource = readFileSync(resolve(currentDir, '../ActionPanel.tsx'), 'utf8');

describe('ActionPanel menu style policy', () => {
  it('uses a shared menu item class for the command action list', () => {
    expect(actionPanelSource).toContain('const ACTION_PANEL_MENU_ITEM_CLASS_NAME =');
    expect(actionPanelSource).toContain(
      "'control-menu-item flex w-full items-center gap-2 rounded-md px-2 py-1.5 outline-none'"
    );
  });

  it('keeps unselected actions on shared menu hover behavior instead of local accent overrides', () => {
    expect(actionPanelSource).toContain("currentIndex === selectedIndex");
    expect(actionPanelSource).toContain("? 'bg-accent text-accent-foreground'");
    expect(actionPanelSource).toContain(": 'text-foreground'");
    expect(actionPanelSource).not.toContain(": 'text-foreground hover:bg-accent/50'");
    expect(actionPanelSource).not.toContain('hover:bg-accent/50');
  });
});
