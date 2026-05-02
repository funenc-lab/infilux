import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const globalsSource = readFileSync(resolve(currentDir, '../../../styles/globals.css'), 'utf8');

describe('sidebar button icon alignment', () => {
  it('keeps sidebar top controls on the same vertical centerline as the main header controls', () => {
    expect(globalsSource).toContain('--control-shell-header-height: 2.375rem;');
    expect(globalsSource).toContain('--control-button-header-size: 2.25rem;');
    expect(globalsSource).toContain('--control-button-header-icon-size: 1rem;');
    expect(globalsSource).toContain(
      '.control-titlebar,\n  .control-topbar-main,\n  .control-sidebar-header {\n    min-height: var(--control-shell-header-height);'
    );
    expect(globalsSource).toContain(
      '.control-topbar-action {\n    display: inline-flex;\n    min-height: var(--control-button-header-size);'
    );
    expect(globalsSource).toContain(
      '.control-topbar-main .control-topbar-action {\n    height: var(--control-button-header-size);\n    min-height: var(--control-button-header-size);'
    );
    expect(globalsSource).toContain(
      '.control-sidebar-header .control-sidebar-toolbutton {\n    height: var(--control-button-header-size);\n    width: var(--control-button-header-size);'
    );
    expect(globalsSource).toContain(
      '.control-topbar-main .control-topbar-action > svg,\n  .control-sidebar-header .control-sidebar-toolbutton > svg {\n    height: var(--control-button-header-icon-size);\n    width: var(--control-button-header-icon-size);'
    );
    expect(globalsSource).toContain(
      '.control-topbar-main .control-toolbar-badge-anchor,\n  .control-sidebar-header .control-toolbar-badge-anchor {\n    align-items: center;\n    justify-content: center;\n    padding: 0;'
    );
    expect(globalsSource).toContain('padding-block: 0;');
    expect(globalsSource).not.toContain(
      '.control-sidebar-header {\n    display: flex;\n    min-height: 2.75rem;'
    );
  });

  it('keeps sidebar header, footer, and action button icons on the same optical slot', () => {
    expect(globalsSource).toContain('.control-sidebar-toolbutton > svg,');
    expect(globalsSource).toContain('.control-sidebar-footer-action > svg,');
    expect(globalsSource).toContain('.control-sidebar .control-action-button > svg {');
    expect(globalsSource).toContain('display: block;');
    expect(globalsSource).toContain('flex: 0 0 auto;');
    expect(globalsSource).toContain('align-self: center;');
    expect(globalsSource).toContain('margin-inline: 0;');
  });
});
