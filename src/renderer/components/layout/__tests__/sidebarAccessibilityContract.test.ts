import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const repositorySidebarSource = readFileSync(
  resolve(currentDir, '../RepositorySidebar.tsx'),
  'utf8'
);
const treeSidebarSource = readFileSync(resolve(currentDir, '../TreeSidebar.tsx'), 'utf8');
const temporaryWorkspacePanelSource = readFileSync(
  resolve(currentDir, '../TemporaryWorkspacePanel.tsx'),
  'utf8'
);

describe('Sidebar accessibility contract', () => {
  it('exposes current selection in repository and tree sidebars', () => {
    expect(repositorySidebarSource).toContain("aria-current={isSelected ? 'page' : undefined}");
    expect(treeSidebarSource).toContain("aria-current={isSelected ? 'page' : undefined}");
    expect(treeSidebarSource).toContain("aria-current={isActive ? 'page' : undefined}");
    expect(temporaryWorkspacePanelSource).toContain("aria-current={isActive ? 'page' : undefined}");
  });

  it('exposes disclosure state for expandable sidebar sections', () => {
    expect(repositorySidebarSource).toContain('aria-expanded={!isCollapsed}');
    expect(treeSidebarSource).toContain('aria-expanded={isExpanded}');
    expect(treeSidebarSource).toContain('aria-expanded={tempExpanded}');
    expect(treeSidebarSource).toContain('aria-controls={tempWorkspacesSectionId}');
  });

  it('gives the temp sessions search input an accessible name', () => {
    expect(temporaryWorkspacePanelSource).toContain("aria-label={t('Search sessions')}");
    expect(temporaryWorkspacePanelSource).toContain("aria-label={t('Clear search')}");
  });
});
