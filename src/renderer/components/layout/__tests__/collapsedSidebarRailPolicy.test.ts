import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(resolve(currentDir, '../../../App.tsx'), 'utf8');
const treeSidebarSource = readFileSync(resolve(currentDir, '../TreeSidebar.tsx'), 'utf8');
const repositorySidebarSource = readFileSync(
  resolve(currentDir, '../RepositorySidebar.tsx'),
  'utf8'
);
const worktreePanelSource = readFileSync(resolve(currentDir, '../WorktreePanel.tsx'), 'utf8');
const temporaryWorkspacePanelSource = readFileSync(
  resolve(currentDir, '../TemporaryWorkspacePanel.tsx'),
  'utf8'
);
const fileSidebarSource = readFileSync(resolve(currentDir, '../../files/FileSidebar.tsx'), 'utf8');

describe('collapsed sidebar rail policy', () => {
  it('keeps collapsed panels mounted and passes collapsed state through App layout', () => {
    expect(appSource).toContain('collapsed={repositoryCollapsed}');
    expect(appSource).toContain('collapsed={worktreeCollapsed}');
    expect(appSource).toContain('collapsed={fileSidebarCollapsed}');
    expect(appSource).not.toContain('!repositoryCollapsed && (');
    expect(appSource).not.toContain('!worktreeCollapsed && (');
  });

  it('renders collapsed rails from the panel owners instead of the topbar alone', () => {
    expect(treeSidebarSource).toContain('CollapsedSidebarRail');
    expect(repositorySidebarSource).toContain('CollapsedSidebarRail');
    expect(worktreePanelSource).toContain('CollapsedSidebarRail');
    expect(temporaryWorkspacePanelSource).toContain('CollapsedSidebarRail');
    expect(fileSidebarSource).toContain('CollapsedSidebarRail');
  });

  it('uses panel-open semantics for collapsed sidebar expand actions', () => {
    expect(treeSidebarSource).toMatch(/label: t\('Expand Sidebar'\),\s+icon: PanelLeftOpen,/s);
    expect(repositorySidebarSource).toMatch(
      /label: t\('Expand Repository'\),\s+icon: PanelLeftOpen,/s
    );
    expect(worktreePanelSource).toMatch(/label: t\('Expand Worktree'\),\s+icon: PanelLeftOpen,/s);
    expect(temporaryWorkspacePanelSource).toMatch(
      /label: t\('Expand Temp Sessions'\),\s+icon: PanelLeftOpen,/s
    );
    expect(fileSidebarSource).toMatch(/label: t\('Expand File Sidebar'\),\s+icon: PanelLeftOpen,/s);
  });
});
