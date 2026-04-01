import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const worktreeTreeItemSource = readFileSync(
  resolve(currentDir, '../tree-sidebar/WorktreeTreeItem.tsx'),
  'utf8'
);
const worktreePanelItemSource = readFileSync(
  resolve(currentDir, '../worktree-panel/WorktreeItem.tsx'),
  'utf8'
);
const globalsSource = readFileSync(resolve(currentDir, '../../../styles/globals.css'), 'utf8');

describe('worktree sidebar cleanup policy', () => {
  it('keeps worktree identity readable with branch, path, and meta rail separation', () => {
    expect(worktreeTreeItemSource).toContain('const metaItems = [');
    expect(worktreeTreeItemSource).toContain(
      "'control-tree-subtitle truncate [unicode-bidi:plaintext] [text-align:left]'"
    );
    expect(worktreeTreeItemSource).toContain('title={displayWorktreePath}');
    expect(worktreeTreeItemSource).toContain('{displayWorktreePath}');
    expect(worktreePanelItemSource).toContain('const metaItems = [');
    expect(worktreePanelItemSource).toContain(
      "'control-tree-subtitle truncate [unicode-bidi:plaintext] [text-align:left]'"
    );
    expect(worktreePanelItemSource).toContain('title={displayWorktreePath}');
    expect(worktreePanelItemSource).toContain('{displayWorktreePath}');
  });

  it('keeps worktree tails structurally visible instead of hover-collapsing the sync action', () => {
    expect(globalsSource).toContain('.control-tree-tail[data-role="action"] {');
    expect(globalsSource).not.toContain(
      '.control-tree-node[data-node-kind="worktree"] .control-tree-tail[data-role="action"] {'
    );
    expect(globalsSource).not.toContain('max-width: 0;');
    expect(globalsSource).not.toContain(
      '.control-tree-node[data-node-kind="worktree"]:hover .control-tree-tail[data-role="action"],'
    );
  });

  it('keeps nested worktree groups on a single guide instead of per-row rails', () => {
    expect(globalsSource).toContain('.control-tree-guide::before {');
    expect(globalsSource).not.toContain('content: none;');
    expect(globalsSource).not.toContain('.control-tree-guide-item::before {');
  });

  it('allows worktree meta rails to wrap instead of forcing crowded one-line fragments', () => {
    expect(globalsSource).toContain('.control-tree-meta-row {');
    expect(globalsSource).toContain('flex-wrap: wrap;');
    expect(globalsSource).toContain('white-space: normal;');
    expect(globalsSource).toContain('overflow: visible;');
  });
});
