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
  it('keeps worktree rows focused on branch identity with subordinate path subtitles', () => {
    expect(worktreeTreeItemSource).toContain('control-tree-title min-w-0 flex-1 truncate');
    expect(worktreeTreeItemSource).toContain('<WorktreeActivityMarker state={activityState} />');
    expect(worktreeTreeItemSource).not.toContain('control-tree-meta control-tree-meta-row min-w-0');
    expect(worktreePanelItemSource).toContain('control-tree-title min-w-0 flex-1 truncate');
    expect(worktreePanelItemSource).toContain('<WorktreeActivityMarker state={activityState} />');
    expect(worktreePanelItemSource).not.toContain(
      'control-tree-meta control-tree-meta-row min-w-0'
    );
    expect(worktreeTreeItemSource).toContain('title={displayWorktreePath}');
    expect(worktreeTreeItemSource).toContain('{displayWorktreePath}');
    expect(worktreePanelItemSource).toContain('title={displayWorktreePath}');
    expect(worktreePanelItemSource).toContain('{displayWorktreePath}');
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

  it('lets worktree inline signals wrap instead of clipping status information', () => {
    expect(globalsSource).toContain(
      'grid-template-columns: var(--control-tree-glyph-slot-size) minmax(0, 1fr) fit-content(10rem);'
    );
    expect(globalsSource).toContain('.control-tree-inline-signals {');
    expect(globalsSource).toContain('flex-wrap: wrap;');
    expect(globalsSource).toContain('overflow: visible;');
    expect(globalsSource).toContain('white-space: normal;');
    expect(globalsSource).toContain('width: max-content;');
    expect(globalsSource).toContain('max-width: 100%;');
    expect(globalsSource).toContain('.control-tree-inline-item {');
    expect(globalsSource).toContain('white-space: nowrap;');
    expect(globalsSource).toContain('justify-self: end;');
    expect(globalsSource).not.toContain('max-width: min(52%, 8.5rem);');
  });
});
