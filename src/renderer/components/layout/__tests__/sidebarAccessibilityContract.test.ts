import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { repositorySidebarSource } from './repositorySidebarSource';
import { treeSidebarSource } from './treeSidebarSource';

const currentDir = dirname(fileURLToPath(import.meta.url));
const temporaryWorkspacePanelSource = readFileSync(
  resolve(currentDir, '../TemporaryWorkspacePanel.tsx'),
  'utf8'
);
const globalsSource = readFileSync(resolve(currentDir, '../../../styles/globals.css'), 'utf8');

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

  it('keeps keyboard focus styling distinct from hover and selection', () => {
    expect(globalsSource).toContain('.control-tree-primary:focus-visible {');
    expect(globalsSource).toContain('.control-section-header:focus-visible {');
    expect(globalsSource).toContain('.control-tree-node[data-active="false"]:focus-within {');
    expect(globalsSource).toContain('.control-tree-node[data-active="repo"]:focus-within {');
    expect(globalsSource).toContain('.control-tree-node[data-active="worktree"]:focus-within {');
    expect(globalsSource).toContain('.control-sidebar-search:focus-within {');
    expect(globalsSource).toContain('var(--ring) 26%');
  });

  it('keeps icon-only sidebar controls above the compact hit-target floor', () => {
    expect(globalsSource).toContain('.control-sidebar-toolbutton {');
    expect(globalsSource).toContain('height: 2.5rem;');
    expect(globalsSource).toContain('width: 2.5rem;');
    expect(globalsSource).toContain('.control-sidebar-search-clear {');
    expect(globalsSource).toContain('height: 2.25rem;');
    expect(globalsSource).toContain('width: 2.25rem;');
    expect(globalsSource).toContain('.control-tree-disclosure {');
    expect(globalsSource).toContain('min-height: 2.25rem;');
    expect(globalsSource).toContain('min-width: 2.25rem;');
    expect(globalsSource).toContain('.control-tree-action {');
    expect(globalsSource).toContain('border-radius: 0.625rem;');
  });
});
