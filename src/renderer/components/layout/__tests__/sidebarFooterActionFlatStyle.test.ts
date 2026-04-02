import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const globalsSource = readFileSync(resolve(currentDir, '../../../styles/globals.css'), 'utf8');
const treeSidebarSource = readFileSync(resolve(currentDir, '../TreeSidebar.tsx'), 'utf8');
const worktreePanelSource = readFileSync(resolve(currentDir, '../WorktreePanel.tsx'), 'utf8');
const repositorySidebarSource = readFileSync(resolve(currentDir, '../RepositorySidebar.tsx'), 'utf8');
const temporaryWorkspacePanelSource = readFileSync(
  resolve(currentDir, '../TemporaryWorkspacePanel.tsx'),
  'utf8'
);

describe('Sidebar footer action flat style', () => {
  it('keeps sidebar footer actions on the shared flat control surface', () => {
    expect(globalsSource).toContain('.control-sidebar-footer-action {');
    expect(globalsSource).toContain('box-shadow: none;');
    expect(globalsSource).toContain('.control-sidebar-footer-action:hover {');
    expect(globalsSource).toContain(
      'box-shadow: 0 0 0 1px color-mix(in oklch, var(--border) 18%, transparent);'
    );
  });

  it('keeps the primary sidebar footer CTA flat-first instead of using raised shadows', () => {
    expect(globalsSource).toContain('.control-sidebar-footer-action-primary {');
    expect(globalsSource).toContain(
      'box-shadow: 0 0 0 1px color-mix(in oklch, var(--primary) 14%, transparent);'
    );
    expect(globalsSource).toContain('.control-sidebar-footer-action-primary:hover {');
    expect(globalsSource).toContain(
      'box-shadow: 0 0 0 1px color-mix(in oklch, var(--primary) 18%, transparent);'
    );
    expect(globalsSource).not.toContain(
      '.control-sidebar-footer-action-primary {\n    border: 1px solid color-mix(in oklch, var(--primary) 18%, transparent);\n    background: color-mix(in oklch, var(--primary) 9%, var(--background) 91%);\n    color: color-mix(in oklch, var(--primary) 70%, var(--foreground) 30%);\n    box-shadow:\n      inset 0 1px 0 color-mix(in oklch, var(--foreground) 2%, transparent),\n      0 6px 14px color-mix(in oklch, var(--foreground) 3%, transparent);'
    );
  });

  it('reuses the shared sidebar footer action class across sidebar entry points', () => {
    expect(treeSidebarSource).toContain(
      'className="control-sidebar-footer-action control-sidebar-footer-action-primary"'
    );
    expect(worktreePanelSource).toContain(
      'className="control-sidebar-footer-action control-sidebar-footer-action-primary"'
    );
    expect(repositorySidebarSource).toContain(
      'className="control-sidebar-footer-action control-sidebar-footer-action-primary"'
    );
    expect(temporaryWorkspacePanelSource).toContain(
      'className="control-sidebar-footer-action control-sidebar-footer-action-primary"'
    );
  });
});
