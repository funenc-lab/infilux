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
  it('keeps worktree rows focused on branch identity while retaining the path for row actions', () => {
    expect(worktreeTreeItemSource).toContain('control-tree-title min-w-0 flex-1 truncate');
    expect(worktreeTreeItemSource).toContain('<WorktreeActivityMarker state={activityState} />');
    expect(worktreeTreeItemSource).not.toContain('control-tree-meta control-tree-meta-row min-w-0');
    expect(worktreeTreeItemSource).toContain(
      'const displayWorktreePath = getDisplayPath(worktree.path);'
    );
    expect(worktreeTreeItemSource).not.toContain('title={displayWorktreePath}');
    expect(worktreeTreeItemSource).not.toContain('{displayWorktreePath}');
    expect(worktreePanelItemSource).toContain('control-tree-title min-w-0 flex-1 truncate');
    expect(worktreePanelItemSource).toContain('<WorktreeActivityMarker state={activityState} />');
    expect(worktreePanelItemSource).not.toContain(
      'control-tree-meta control-tree-meta-row min-w-0'
    );
    expect(worktreePanelItemSource).toContain(
      'const displayWorktreePath = getDisplayPath(worktree.path);'
    );
    expect(worktreePanelItemSource).not.toContain('title={displayWorktreePath}');
    expect(worktreePanelItemSource).not.toContain('{displayWorktreePath}');
  });

  it('keeps worktree tails collapsed until hover or focus to preserve row density', () => {
    expect(globalsSource).toContain('.control-tree-tail[data-role="action"] {');
    expect(globalsSource).toContain(
      '.control-tree-node[data-node-kind="worktree"] .control-tree-tail[data-role="action"] {'
    );
    expect(globalsSource).toContain('max-width: 0;');
    expect(globalsSource).toContain('pointer-events: none;');
    expect(globalsSource).toContain(
      '.control-tree-node[data-node-kind="worktree"]:hover .control-tree-tail[data-role="action"],'
    );
    expect(globalsSource).toContain('max-width: 6.5rem;');
    expect(globalsSource).toContain('align-items: center;');
    expect(globalsSource).toContain('align-self: center;');
    expect(globalsSource).toContain('transform: none;');
  });

  it('keeps nested worktree groups on a single guide instead of per-row rails', () => {
    expect(globalsSource).toContain('.control-tree-guide::before {');
    expect(globalsSource).not.toContain('.control-tree-guide-item::before {');
  });

  it('keeps worktree status in a leading slot instead of a second meta line', () => {
    expect(worktreeTreeItemSource).toContain('<div className="control-tree-title-row">');
    expect(worktreePanelItemSource).toContain('<div className="control-tree-title-row">');
    expect(worktreeTreeItemSource).toContain('<WorktreeActivityMarker state={activityState} />');
    expect(worktreePanelItemSource).toContain('<WorktreeActivityMarker state={activityState} />');
    expect(worktreeTreeItemSource).toContain('control-tree-status-slot');
    expect(worktreePanelItemSource).toContain('control-tree-status-slot');
    expect(worktreeTreeItemSource).not.toContain('const metaItems = [');
    expect(worktreePanelItemSource).not.toContain('const metaItems = [');
  });

  it('keeps publish as a tail action instead of duplicating it in worktree meta rows', () => {
    expect(worktreeTreeItemSource).not.toContain("key: 'publish'");
    expect(worktreePanelItemSource).not.toContain("key: 'publish'");
  });
});
