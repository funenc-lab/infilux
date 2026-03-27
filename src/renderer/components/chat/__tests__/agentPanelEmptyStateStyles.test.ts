import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const panelSource = readFileSync(resolve(currentDir, '../AgentPanel.tsx'), 'utf8');

describe('AgentPanel empty state styles', () => {
  it('uses shared console action button classes for the empty state controls', () => {
    expect(panelSource).toContain('control-action-button');
    expect(panelSource).toContain('control-action-button-primary');
    expect(panelSource).toContain('control-action-button-secondary');
  });

  it('uses themed button variants for the empty state actions', () => {
    expect(panelSource).toMatch(/<Button[\s\S]*?variant="default"/m);
    expect(panelSource).toMatch(/<Button[\s\S]*?variant="outline"/m);
  });

  it('uses the shared console menu item class for profile options', () => {
    expect(panelSource).toContain('control-menu-item');
  });

  it('keeps the profile picker header label shrink-safe beside the settings button', () => {
    expect(panelSource).toContain('mb-1 flex min-w-0 items-center justify-between gap-2 px-1 py-1');
    expect(panelSource).toContain('control-menu-label min-w-0 flex-1 truncate pr-2');
  });
});
