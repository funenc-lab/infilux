import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const treeSidebarSource = readFileSync(resolve(currentDir, '../TreeSidebar.tsx'), 'utf8');
const worktreeTreeItemSource = readFileSync(
  resolve(currentDir, '../tree-sidebar/WorktreeTreeItem.tsx'),
  'utf8'
);

describe('tree sidebar policy entry', () => {
  it('adds a direct project policy entry to the repository context menu', () => {
    expect(treeSidebarSource).toContain("{t('Project Configuration')}");
    expect(treeSidebarSource).toContain('setRepoPolicyOpen(true)');
  });

  it('adds a direct worktree policy entry to the worktree context menu', () => {
    expect(worktreeTreeItemSource).toContain("{t('Worktree Configuration')}");
    expect(worktreeTreeItemSource).toContain('onEditPolicy();');
  });
});
