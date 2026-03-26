import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const mainContentSource = readFileSync(resolve(currentDir, '../MainContent.tsx'), 'utf8');
const treeSidebarSource = readFileSync(resolve(currentDir, '../TreeSidebar.tsx'), 'utf8');
const fileTreeSource = readFileSync(resolve(currentDir, '../../files/FileTree.tsx'), 'utf8');

describe('Console empty state consistency', () => {
  it('uses the shared console empty state in the main content chat idle state', () => {
    expect(mainContentSource).toContain('ConsoleEmptyState');
    expect(mainContentSource).toContain('AI Collaboration Console');
  });

  it('uses the shared sidebar empty state in the projects sidebar empty states', () => {
    expect(treeSidebarSource).toContain('SidebarEmptyState');
    expect(treeSidebarSource).not.toContain('EmptyHeader');
    expect(treeSidebarSource).not.toContain('EmptyTitle');
  });

  it('uses the shared console empty state and action button styles in the file tree', () => {
    expect(fileTreeSource).toContain('ConsoleEmptyState');
    expect(fileTreeSource).toContain('control-action-button-primary');
    expect(fileTreeSource).toContain('control-action-button-secondary');
  });
});
