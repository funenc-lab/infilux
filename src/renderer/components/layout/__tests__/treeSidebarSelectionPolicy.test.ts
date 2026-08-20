import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { treeSidebarSource } from './treeSidebarSource';

const currentDir = dirname(fileURLToPath(import.meta.url));
const worktreeTreeItemSource = readFileSync(
  resolve(currentDir, '../tree-sidebar/WorktreeTreeItem.tsx'),
  'utf8'
);

describe('tree sidebar selection policy', () => {
  it('routes worktree clicks through repo-aware worktree selection instead of split repo updates', () => {
    expect(treeSidebarSource).toContain('onSelect={handleTreeWorktreeSelect}');
    expect(worktreeTreeItemSource).toContain(
      'onSelect(worktree, isRepositorySelected ? undefined : repositoryPath);'
    );
    expect(treeSidebarSource).not.toContain('onSelectRepo(repo.path, { activateRemote: true });');
  });
});
